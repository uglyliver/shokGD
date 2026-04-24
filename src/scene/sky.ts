import {
  Color3,
  DirectionalLight,
  EquiRectangularCubeTexture,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

// Procedural dusty-daylight skydome + IBL. Both come from the same painted
// equirectangular panorama so the skybox you see and the environment lighting
// driving PBR materials match. No external HDR assets, no CDN dependency.

const SUN_AZIMUTH_DEG = 200;   // where the sun sits along the horizon (0 = +Z)
const SUN_ELEVATION_DEG = 40;  // height above the horizon

/**
 * Equirectangular panorama (2:1) of the afternoon Delhi sky:
 *   - bluish zenith at the top
 *   - warm dust/haze layer at the horizon
 *   - darker warm tone below the horizon (ground-bounce dome)
 *   - a hot sun blob at the configured azimuth/elevation, so metallic
 *     surfaces pick up a recognisable specular highlight when they sample
 *     the cubemap.
 *
 * Returned as a normal Texture so it can also drive the visible skydome.
 */
function paintSkyEquirect(scene: Scene): Texture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Vertical gradient: top (y=0) is zenith, bottom (y=h) is nadir/ground.
  // The horizon line sits at y = h/2 (latitude 0).
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#5a90c8");     // zenith — saturated blue
  grad.addColorStop(0.35, "#9bb8d0");    // mid sky
  grad.addColorStop(0.48, "#d4ba90");    // approaching horizon — warm haze
  grad.addColorStop(0.50, "#dcc28f");    // horizon line
  grad.addColorStop(0.55, "#a89070");    // distant haze below horizon
  grad.addColorStop(1.0, "#3d3024");     // nadir / dusty ground bounce
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle haze banding near horizon.
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    const y = Math.floor(h * 0.42 + (i / 30) * h * 0.12);
    ctx.fillRect(0, y, w, 2);
  }
  ctx.globalAlpha = 1;

  // Sun blob — drives specular reflections on metallic surfaces.
  // Equirect mapping: longitude → x ∈ [0, w], latitude → y ∈ [0, h].
  const sunX = (SUN_AZIMUTH_DEG / 360) * w;
  const sunY = h * 0.5 - (SUN_ELEVATION_DEG / 90) * (h * 0.5);
  const sunRadius = 70;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  sunGrad.addColorStop(0.0, "rgba(255, 248, 220, 1.0)");
  sunGrad.addColorStop(0.25, "rgba(255, 222, 160, 0.85)");
  sunGrad.addColorStop(0.6, "rgba(255, 200, 140, 0.35)");
  sunGrad.addColorStop(1.0, "rgba(255, 200, 140, 0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  const tex = new Texture(
    "data:" + canvas.toDataURL("image/png"),
    scene,
    true,    // noMipmapOrOptions (true = no mipmaps for the sky-sphere copy)
    false,
  );
  tex.name = "skyEquirect";
  return tex;
}

/**
 * Convert the painted equirectangular into a cubemap usable by PBRMaterial as
 * scene.environmentTexture. We re-paint into a fresh canvas (rather than
 * sharing the Texture instance) because EquiRectangularCubeTexture takes a
 * URL/data-URL, not a live Texture.
 */
function buildEnvironmentCube(scene: Scene): EquiRectangularCubeTexture {
  // Re-render the panorama at higher resolution for cleaner reflections.
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#5a90c8");
  grad.addColorStop(0.35, "#9bb8d0");
  grad.addColorStop(0.48, "#d4ba90");
  grad.addColorStop(0.50, "#dcc28f");
  grad.addColorStop(0.55, "#a89070");
  grad.addColorStop(1.0, "#3d3024");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Hotter sun for the IBL — drives bright specular highlights without
  // washing out the visible skydome (which uses the gentler version above).
  const sunX = (SUN_AZIMUTH_DEG / 360) * w;
  const sunY = h * 0.5 - (SUN_ELEVATION_DEG / 90) * (h * 0.5);
  const sunRadius = 140;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  sunGrad.addColorStop(0.0, "rgba(255, 250, 230, 1.0)");
  sunGrad.addColorStop(0.2, "rgba(255, 230, 180, 0.95)");
  sunGrad.addColorStop(0.6, "rgba(255, 210, 150, 0.4)");
  sunGrad.addColorStop(1.0, "rgba(255, 200, 140, 0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  const url = "data:" + canvas.toDataURL("image/png");
  // Cube face size 512 — good balance between reflection sharpness and
  // GPU memory. Mip chain is automatic and is what PBRMaterial samples for
  // roughness LOD selection.
  const cube = new EquiRectangularCubeTexture(url, scene, 512, false, true);
  cube.name = "skyEnvCube";
  return cube;
}

export interface SkyLights {
  sun: DirectionalLight;
  bounce: HemisphericLight;
}

export function buildSky(scene: Scene): SkyLights {
  const sky = MeshBuilder.CreateSphere(
    "sky",
    { diameter: 2000, sideOrientation: 1 /* BACKSIDE */ },
    scene,
  );
  sky.isPickable = false;
  sky.checkCollisions = false;
  sky.infiniteDistance = true;

  const mat = new StandardMaterial("skyMat", scene);
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  mat.emissiveTexture = paintSkyEquirect(scene);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  sky.material = mat;

  // IBL: drive PBR diffuse irradiance + specular reflections from the same
  // painted sky. Without this, PBR materials in shadow have nothing to bounce
  // off of and read pitch-black. With it, plastered walls pick up warm
  // horizon glow on shaded sides and metallic bits show real sky reflections.
  scene.environmentTexture = buildEnvironmentCube(scene);
  scene.environmentIntensity = 1.1;

  // Warm afternoon sun. Direction biased so shops cast long oblique shadows
  // across the lane (sun is roughly south-west in this scene's framing).
  // Position the light far enough back along the inverse direction that its
  // shadow frustum can encompass the whole lane.
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -0.85, 0.3), scene);
  sun.intensity = 2.4;                          // boosted for ACES tonemap
  sun.diffuse = new Color3(1.0, 0.9, 0.72);     // warmer for late afternoon
  sun.specular = new Color3(1.0, 0.92, 0.78);
  sun.position = new Vector3(40, 85, -30);      // back along -direction × ~100m
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 250;

  // Hemispheric bounce — kept as a safety net for non-PBR materials and to
  // guarantee minimal lift in case IBL isn't fully ready when the first
  // frames render. Lower than before because the IBL is doing the heavy
  // ambient lifting now.
  const bounce = new HemisphericLight("bounce", new Vector3(0, 1, 0), scene);
  bounce.intensity = 0.25;
  bounce.diffuse = new Color3(0.78, 0.82, 0.9);
  bounce.groundColor = new Color3(0.42, 0.34, 0.26);

  return { sun, bounce };
}

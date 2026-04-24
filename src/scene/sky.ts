import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";

// Procedural dusty-daylight skydome. A gradient from warm horizon haze to
// bluish zenith, painted to a canvas at boot. Cheaper than a cubemap and no
// assets to ship.

function paintSkyTexture(scene: Scene): Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, "#6aa5d6"); // zenith — slightly desaturated blue
  grad.addColorStop(0.55, "#cfd6d9"); // mid haze
  grad.addColorStop(0.85, "#e9c9a1"); // horizon warmth (dust)
  grad.addColorStop(1.0, "#d6b48c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Faint horizontal banding for haze layers.
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    const y = Math.floor((i / 40) * size);
    ctx.fillRect(0, y, size, 2);
  }
  ctx.globalAlpha = 1;

  const tex = new Texture(
    "data:" + canvas.toDataURL("image/png"),
    scene,
    true,
    false,
  );
  tex.name = "skyGradient";
  return tex;
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
  mat.emissiveTexture = paintSkyTexture(scene);
  mat.diffuseColor = new Color3(0, 0, 0);
  mat.specularColor = new Color3(0, 0, 0);
  sky.material = mat;

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

  const bounce = new HemisphericLight("bounce", new Vector3(0, 1, 0), scene);
  bounce.intensity = 0.7;                       // PBR needs more ambient lift
  bounce.diffuse = new Color3(0.78, 0.82, 0.9); // sky-tinted top
  bounce.groundColor = new Color3(0.42, 0.34, 0.26); // warm dust bounce

  return { sun, bounce };
}

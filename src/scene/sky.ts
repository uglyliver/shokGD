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

export function buildSky(scene: Scene): void {
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

  // Warm afternoon sun, slightly off-axis so shops cast long shadows across
  // the lane.
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -0.85, 0.3), scene);
  sun.intensity = 1.4;
  sun.diffuse = new Color3(1.0, 0.92, 0.78);
  sun.specular = new Color3(1.0, 0.95, 0.82);

  const bounce = new HemisphericLight("bounce", new Vector3(0, 1, 0), scene);
  bounce.intensity = 0.45;
  bounce.diffuse = new Color3(0.78, 0.82, 0.9);
  bounce.groundColor = new Color3(0.35, 0.28, 0.22);
}

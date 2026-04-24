import {
  Color3,
  Color4,
  MeshBuilder,
  ParticleSystem,
  Scene,
  Texture,
  Vector3,
} from "@babylonjs/core";

import type { Lane } from "./lane";
import { pbr } from "./materials";
import { castAndReceive, castShadow } from "./shadows";

function paintSteamParticleTexture(scene: Scene): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new Texture("data:" + canvas.toDataURL("image/png"), scene);
}

// A humble chai stall: a low wooden cart with a kettle/pot on top and steam.
export function buildChaiStall(scene: Scene, lane: Lane): void {
  const basePos =
    (lane as Lane & { chaiStallPos?: Vector3 }).chaiStallPos ??
    new Vector3(-15, 0, lane.shopFrontZ - 1.4);

  // Cart base (1.8m wide, 0.9m deep, 0.9m tall).
  const cart = MeshBuilder.CreateBox(
    "chai_cart",
    { width: 1.8, height: 0.9, depth: 0.9 },
    scene,
  );
  cart.position.set(basePos.x, 0.45, basePos.z);
  cart.material = pbr(scene, "chai_cart_mat", {
    albedo: new Color3(0.45, 0.28, 0.16),
    roughness: 0.85,                              // weathered painted wood
  });
  cart.checkCollisions = true;
  cart.isPickable = false;
  castAndReceive(cart);

  // Counter top.
  const top = MeshBuilder.CreateBox(
    "chai_top",
    { width: 1.85, height: 0.06, depth: 0.95 },
    scene,
  );
  top.position.set(basePos.x, 0.93, basePos.z);
  top.material = pbr(scene, "chai_top_mat", {
    albedo: new Color3(0.7, 0.65, 0.55),
    roughness: 0.6,                               // worn formica/laminate
  });
  top.checkCollisions = false;
  top.isPickable = false;
  castShadow(top);

  // Kettle — cylinder + a knob.
  const kettle = MeshBuilder.CreateCylinder(
    "chai_kettle",
    { height: 0.45, diameter: 0.32 },
    scene,
  );
  kettle.position.set(basePos.x - 0.4, 1.17, basePos.z - 0.1);
  kettle.material = pbr(scene, "chai_kettle_mat", {
    albedo: new Color3(0.7, 0.6, 0.3),            // tarnished brass
    metallic: 0.85,
    roughness: 0.35,
  });
  kettle.checkCollisions = false;
  kettle.isPickable = false;
  castShadow(kettle);

  // Pot — bigger, for doodh/chai boil.
  const pot = MeshBuilder.CreateCylinder(
    "chai_pot",
    { height: 0.38, diameter: 0.5 },
    scene,
  );
  pot.position.set(basePos.x + 0.3, 1.14, basePos.z - 0.1);
  pot.material = pbr(scene, "chai_pot_mat", {
    albedo: new Color3(0.25, 0.22, 0.18),         // soot-blackened cooking pot
    metallic: 0.7,
    roughness: 0.55,
  });
  pot.checkCollisions = false;
  pot.isPickable = false;
  castShadow(pot);

  // Small tarp roof held by bamboo-poles (4 cylinders + a flat box).
  for (const [dx, dz] of [
    [-0.85, -0.4],
    [0.85, -0.4],
    [-0.85, 0.4],
    [0.85, 0.4],
  ]) {
    const pole = MeshBuilder.CreateCylinder(
      "chai_pole",
      { height: 2.3, diameter: 0.06 },
      scene,
    );
    pole.position.set(basePos.x + dx, 1.15, basePos.z + dz);
    pole.material = pbr(scene, "chai_pole_mat", {
      albedo: new Color3(0.65, 0.5, 0.3),
      roughness: 0.85,                            // bamboo
    });
    pole.isPickable = false;
    pole.checkCollisions = false;
    castShadow(pole);
  }
  const tarp = MeshBuilder.CreateBox(
    "chai_tarp",
    { width: 2.0, height: 0.04, depth: 1.0 },
    scene,
  );
  tarp.position.set(basePos.x, 2.3, basePos.z);
  tarp.rotation.x = 0.1;
  tarp.material = pbr(scene, "chai_tarp_mat", {
    albedo: new Color3(0.2, 0.35, 0.18),
    roughness: 0.95,                              // canvas tarp
  });
  tarp.isPickable = false;
  tarp.checkCollisions = false;
  castShadow(tarp);

  // Steam particles off the pot.
  const steam = new ParticleSystem("chai_steam", 100, scene);
  steam.particleTexture = paintSteamParticleTexture(scene);
  steam.emitter = pot;
  steam.minEmitBox = new Vector3(-0.1, 0.2, -0.1);
  steam.maxEmitBox = new Vector3(0.1, 0.25, 0.1);
  steam.color1 = new Color4(1, 1, 1, 0.6);
  steam.color2 = new Color4(0.9, 0.9, 0.9, 0.3);
  steam.colorDead = new Color4(1, 1, 1, 0);
  steam.minSize = 0.3;
  steam.maxSize = 0.9;
  steam.minLifeTime = 1.2;
  steam.maxLifeTime = 2.2;
  steam.emitRate = 30;
  steam.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  steam.direction1 = new Vector3(-0.05, 1.4, -0.05);
  steam.direction2 = new Vector3(0.05, 1.6, 0.05);
  steam.minEmitPower = 0.2;
  steam.maxEmitPower = 0.5;
  steam.updateSpeed = 0.02;
  steam.start();
}

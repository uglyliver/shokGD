import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

import type { Lane } from "../scene/lane";
import { mulberry32, range, type Rng } from "../util/rand";
import { AssetLibrary, instantiateModel } from "../scene/assets";

export interface Cow {
  root: TransformNode;
  target: Vector3;
  speed: number;
  idleTimer: number;
  lane: Lane;
  rng: Rng;
  usingModel: boolean;
}

function pickCowTarget(lane: Lane, rng: Rng): Vector3 {
  return new Vector3(
    range(rng, -lane.length / 2 + 5, lane.length / 2 - 5),
    0,
    range(rng, -lane.roadWidth / 2 + 1, lane.roadWidth / 2 - 1),
  );
}

// Procedural cow fallback — used when cow.glb isn't present. Keeps the scene
// alive even with no art yet.
function buildProcCow(scene: Scene, root: Mesh): void {
  const coat = new Color3(0.92, 0.9, 0.86);
  const coatDark = new Color3(0.2, 0.15, 0.12);
  const bodyMat = new StandardMaterial("cow_body_mat", scene);
  bodyMat.diffuseColor = coat;
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);

  const body = MeshBuilder.CreateBox("cow_body", { width: 0.7, height: 0.8, depth: 1.6 }, scene);
  body.position.y = 0.9;
  body.parent = root;
  body.material = bodyMat;
  body.isPickable = false;

  const patch = MeshBuilder.CreateBox("cow_patch", { width: 0.72, height: 0.4, depth: 0.5 }, scene);
  patch.position.set(0, 0.9, 0.2);
  patch.parent = root;
  const patchMat = new StandardMaterial("cow_patch_mat", scene);
  patchMat.diffuseColor = coatDark;
  patchMat.specularColor = new Color3(0, 0, 0);
  patch.material = patchMat;
  patch.isPickable = false;

  const head = MeshBuilder.CreateBox("cow_head", { width: 0.45, height: 0.45, depth: 0.55 }, scene);
  head.position.set(0, 1.0, 1.0);
  head.parent = root;
  head.material = bodyMat;
  head.isPickable = false;

  const hump = MeshBuilder.CreateSphere("cow_hump", { diameter: 0.5, segments: 8 }, scene);
  hump.position.set(0, 1.35, 0.4);
  hump.scaling.set(0.9, 0.7, 1.1);
  hump.parent = root;
  hump.material = bodyMat;
  hump.isPickable = false;

  for (const sx of [-1, 1]) {
    const horn = MeshBuilder.CreateCylinder(
      "cow_horn",
      { height: 0.3, diameterTop: 0.02, diameterBottom: 0.06 },
      scene,
    );
    horn.position.set(sx * 0.15, 1.3, 1.15);
    horn.rotation.z = sx * -0.5;
    horn.parent = root;
    const hm = new StandardMaterial("cow_horn_mat", scene);
    hm.diffuseColor = new Color3(0.6, 0.5, 0.4);
    hm.specularColor = new Color3(0, 0, 0);
    horn.material = hm;
    horn.isPickable = false;
  }

  for (const [dx, dz] of [
    [-0.25, -0.6],
    [0.25, -0.6],
    [-0.25, 0.6],
    [0.25, 0.6],
  ]) {
    const leg = MeshBuilder.CreateCylinder(
      "cow_leg",
      { height: 0.9, diameterTop: 0.1, diameterBottom: 0.12 },
      scene,
    );
    leg.position.set(dx, 0.45, dz);
    leg.parent = root;
    leg.material = bodyMat;
    leg.isPickable = false;
  }

  const tail = MeshBuilder.CreateCylinder(
    "cow_tail",
    { height: 0.7, diameterTop: 0.03, diameterBottom: 0.06 },
    scene,
  );
  tail.position.set(0, 1.05, -0.85);
  tail.rotation.x = 0.3;
  tail.parent = root;
  tail.material = bodyMat;
  tail.isPickable = false;
}

export function spawnCow(scene: Scene, lane: Lane, assets: AssetLibrary): Cow {
  const rng = mulberry32(9001);

  let root: TransformNode;
  let usingModel = false;

  const inst = instantiateModel(assets, "cow", scene, "cow_inst");
  if (inst) {
    root = inst.root;
    usingModel = true;
    // Kick off any idle/walk anim — accept unnamed animations too.
    const walk =
      inst.animations.find((a) => /walk|idle|locomotion|move/i.test(a.name)) ??
      inst.animations[0];
    walk?.start(true);
  } else {
    root = new Mesh("cow", scene);
    buildProcCow(scene, root as Mesh);
  }

  const start = pickCowTarget(lane, rng);
  root.position.copyFrom(start);

  return {
    root,
    target: pickCowTarget(lane, rng),
    speed: 0.45,
    idleTimer: 0,
    lane,
    rng,
    usingModel,
  };
}

export function updateCow(cow: Cow, dt: number): void {
  if (cow.idleTimer > 0) {
    cow.idleTimer -= dt;
    return;
  }
  const pos = cow.root.position;
  const to = cow.target.subtract(pos);
  to.y = 0;
  const dist = to.length();
  if (dist < 0.5) {
    cow.target = pickCowTarget(cow.lane, cow.rng);
    cow.idleTimer = 3 + cow.rng() * 6;
    return;
  }
  const step = Math.min(dist, cow.speed * dt);
  to.normalize();
  pos.x += to.x * step;
  pos.z += to.z * step;
  cow.root.rotation.y = Math.atan2(to.x, to.z);
}

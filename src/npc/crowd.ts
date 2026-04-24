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
import { mulberry32, pick, range, type Rng } from "../util/rand";
import { AssetLibrary, instantiateModel } from "../scene/assets";

interface Npc {
  root: TransformNode;
  target: Vector3;
  speed: number;
  idleTimer: number;
  bobPhase: number;
  side: 1 | -1;
  usingModel: boolean;
}

export interface Crowd {
  npcs: Npc[];
  lane: Lane;
  rng: Rng;
}

const KURTA_COLORS = [
  new Color3(0.85, 0.78, 0.6),
  new Color3(0.7, 0.15, 0.15),
  new Color3(0.15, 0.3, 0.5),
  new Color3(0.9, 0.85, 0.82),
  new Color3(0.9, 0.55, 0.15),
  new Color3(0.4, 0.25, 0.6),
  new Color3(0.2, 0.5, 0.3),
  new Color3(0.8, 0.3, 0.5),
  new Color3(0.3, 0.3, 0.35),
  new Color3(0.95, 0.95, 0.95),
];

const SKIN_TONES = [
  new Color3(0.78, 0.58, 0.42),
  new Color3(0.72, 0.52, 0.38),
  new Color3(0.65, 0.45, 0.32),
  new Color3(0.55, 0.38, 0.28),
  new Color3(0.85, 0.68, 0.52),
];

function pickTarget(lane: Lane, side: 1 | -1, rng: Rng): Vector3 {
  const pavCenterZ = side * (lane.roadWidth / 2 + lane.pavementWidth / 2);
  return new Vector3(
    range(rng, -lane.length / 2 + 3, lane.length / 2 - 3),
    0,
    pavCenterZ + range(rng, -lane.pavementWidth * 0.35, lane.pavementWidth * 0.35),
  );
}

function buildProcNpc(scene: Scene, root: Mesh, idx: number, rng: Rng): void {
  const kurta = pick(rng, KURTA_COLORS);
  const skin = pick(rng, SKIN_TONES);
  const tall = range(rng, 1.55, 1.82);

  const torso = MeshBuilder.CreateBox(
    `npc_torso_${idx}`,
    { width: 0.45, height: tall * 0.55, depth: 0.28 },
    scene,
  );
  torso.position.y = tall * 0.55 * 0.5 + tall * 0.18;
  torso.parent = root;
  const torsoMat = new StandardMaterial(`npc_torso_mat_${idx}`, scene);
  torsoMat.diffuseColor = kurta;
  torsoMat.specularColor = new Color3(0, 0, 0);
  torso.material = torsoMat;
  torso.isPickable = false;

  const legs = MeshBuilder.CreateBox(
    `npc_legs_${idx}`,
    { width: 0.38, height: tall * 0.45, depth: 0.28 },
    scene,
  );
  legs.position.y = tall * 0.45 * 0.5;
  legs.parent = root;
  const legsMat = new StandardMaterial(`npc_legs_mat_${idx}`, scene);
  legsMat.diffuseColor = new Color3(
    kurta.r * 0.5,
    kurta.g * 0.45,
    kurta.b * 0.4,
  );
  legsMat.specularColor = new Color3(0, 0, 0);
  legs.material = legsMat;
  legs.isPickable = false;

  const head = MeshBuilder.CreateSphere(
    `npc_head_${idx}`,
    { diameter: 0.28, segments: 10 },
    scene,
  );
  head.position.y = tall * 0.55 + tall * 0.22;
  head.parent = root;
  const headMat = new StandardMaterial(`npc_head_mat_${idx}`, scene);
  headMat.diffuseColor = skin;
  headMat.specularColor = new Color3(0.05, 0.05, 0.05);
  head.material = headMat;
  head.isPickable = false;
}

export function spawnCrowd(
  scene: Scene,
  lane: Lane,
  count: number,
  assets: AssetLibrary,
): Crowd {
  const rng = mulberry32(42);
  const npcs: Npc[] = [];

  // Decide per-NPC which template to try (male/female), with equal weight.
  // Falls back to procedural boxes if the template isn't loaded.
  for (let i = 0; i < count; i++) {
    const side = (rng() > 0.5 ? 1 : -1) as 1 | -1;
    const wantFemale = rng() > 0.5;

    let root: TransformNode;
    let usingModel = false;

    const tryKeys = wantFemale
      ? ["npc_female_saree", "npc_male_kurta"]
      : ["npc_male_kurta", "npc_female_saree"];
    let inst = null;
    for (const k of tryKeys) {
      inst = instantiateModel(assets, k, scene, `npc_${i}`);
      if (inst) break;
    }

    if (inst) {
      root = inst.root;
      usingModel = true;
      // Prefer a named walk cycle; fall back to the first animation group
      // (many models, including the Khronos reference CesiumMan, ship with
      // unnamed animations like "animation_0").
      const walk =
        inst.animations.find((a) => /walk|locomotion|run|move/i.test(a.name)) ??
        inst.animations[0];
      walk?.start(true);
    } else {
      root = new Mesh(`npc_${i}`, scene);
      buildProcNpc(scene, root as Mesh, i, rng);
    }

    const start = pickTarget(lane, side, rng);
    root.position.copyFrom(start);

    const target = pickTarget(lane, side, rng);
    npcs.push({
      root,
      target,
      speed: range(rng, 0.9, 1.5),
      idleTimer: 0,
      bobPhase: rng() * Math.PI * 2,
      side,
      usingModel,
    });
  }

  return { npcs, lane, rng };
}

export function updateCrowd(crowd: Crowd, dt: number): void {
  for (const npc of crowd.npcs) {
    if (npc.idleTimer > 0) {
      npc.idleTimer -= dt;
      continue;
    }
    const pos = npc.root.position;
    const to = npc.target.subtract(pos);
    to.y = 0;
    const dist = to.length();
    if (dist < 0.3) {
      npc.target = pickTarget(crowd.lane, npc.side, crowd.rng);
      npc.idleTimer = 0.5 + crowd.rng() * 2.0;
      continue;
    }
    const step = Math.min(dist, npc.speed * dt);
    to.normalize();
    pos.x += to.x * step;
    pos.z += to.z * step;
    npc.root.rotation.y = Math.atan2(to.x, to.z);
    // Only rock the body for the procedural boxes; real rigged models animate
    // themselves via the "walk" AnimationGroup.
    if (!npc.usingModel) {
      npc.bobPhase += dt * npc.speed * 6;
      npc.root.rotation.z = Math.sin(npc.bobPhase) * 0.04;
    }
  }
}

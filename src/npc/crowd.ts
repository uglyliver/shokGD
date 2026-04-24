import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";

import type { Lane } from "../scene/lane";
import { mulberry32, pick, range, type Rng } from "../util/rand";

// NPCs are simple two-part capsule figures (torso box + head sphere) with a
// wander behavior: pick a random target on a pavement, walk to it, idle a
// beat, pick again. No path planning — the pavement is convex enough.

interface Npc {
  root: Mesh;
  torso: Mesh;
  target: Vector3;
  speed: number;
  idleTimer: number;
  bobPhase: number;
  side: 1 | -1;
}

export interface Crowd {
  npcs: Npc[];
  lane: Lane;
  rng: Rng;
}

const KURTA_COLORS = [
  new Color3(0.85, 0.78, 0.6), // cream kurta
  new Color3(0.7, 0.15, 0.15), // maroon
  new Color3(0.15, 0.3, 0.5), // navy
  new Color3(0.9, 0.85, 0.82), // off white
  new Color3(0.9, 0.55, 0.15), // saffron
  new Color3(0.4, 0.25, 0.6), // purple (saree)
  new Color3(0.2, 0.5, 0.3), // green
  new Color3(0.8, 0.3, 0.5), // pink saree
  new Color3(0.3, 0.3, 0.35), // grey
  new Color3(0.95, 0.95, 0.95), // white
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

export function spawnCrowd(scene: Scene, lane: Lane, count: number): Crowd {
  const rng = mulberry32(42);
  const npcs: Npc[] = [];

  for (let i = 0; i < count; i++) {
    const side = (rng() > 0.5 ? 1 : -1) as 1 | -1;
    const root = new Mesh(`npc_${i}`, scene);

    const kurta = pick(rng, KURTA_COLORS);
    const skin = pick(rng, SKIN_TONES);
    const tall = range(rng, 1.55, 1.82);

    const torso = MeshBuilder.CreateBox(
      `npc_torso_${i}`,
      { width: 0.45, height: tall * 0.55, depth: 0.28 },
      scene,
    );
    torso.position.y = tall * 0.55 * 0.5 + tall * 0.18;
    torso.parent = root;
    const torsoMat = new StandardMaterial(`npc_torso_mat_${i}`, scene);
    torsoMat.diffuseColor = kurta;
    torsoMat.specularColor = new Color3(0, 0, 0);
    torso.material = torsoMat;
    torso.isPickable = false;
    torso.checkCollisions = false;

    const legs = MeshBuilder.CreateBox(
      `npc_legs_${i}`,
      { width: 0.38, height: tall * 0.45, depth: 0.28 },
      scene,
    );
    legs.position.y = tall * 0.45 * 0.5;
    legs.parent = root;
    const legsMat = new StandardMaterial(`npc_legs_mat_${i}`, scene);
    legsMat.diffuseColor = new Color3(
      kurta.r * 0.5,
      kurta.g * 0.45,
      kurta.b * 0.4,
    );
    legsMat.specularColor = new Color3(0, 0, 0);
    legs.material = legsMat;
    legs.isPickable = false;
    legs.checkCollisions = false;

    const head = MeshBuilder.CreateSphere(
      `npc_head_${i}`,
      { diameter: 0.28, segments: 10 },
      scene,
    );
    head.position.y = tall * 0.55 + tall * 0.22;
    head.parent = root;
    const headMat = new StandardMaterial(`npc_head_mat_${i}`, scene);
    headMat.diffuseColor = skin;
    headMat.specularColor = new Color3(0.05, 0.05, 0.05);
    head.material = headMat;
    head.isPickable = false;
    head.checkCollisions = false;

    // Initial position somewhere on the pavement.
    const start = pickTarget(lane, side, rng);
    root.position.copyFrom(start);

    const target = pickTarget(lane, side, rng);
    npcs.push({
      root,
      torso,
      target,
      speed: range(rng, 0.9, 1.5),
      idleTimer: 0,
      bobPhase: rng() * Math.PI * 2,
      side,
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
    // Face direction of travel.
    npc.root.rotation.y = Math.atan2(to.x, to.z);
    // Subtle walk sway — rotate the whole body around Z a little in phase
    // with the step cadence.
    npc.bobPhase += dt * npc.speed * 6;
    npc.root.rotation.z = Math.sin(npc.bobPhase) * 0.04;
  }
}

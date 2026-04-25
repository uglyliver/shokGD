import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

import type { Lane } from "../scene/lane";
import { pbr } from "../scene/materials";
import { castShadow } from "../scene/shadows";
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

// Top-wear palettes biased toward warm cottons + the occasional bold festive
// colour, plus a few muted greys/whites for office shirt-pant types.
const KURTA_COLORS = [
  new Color3(0.95, 0.90, 0.78),  // off-white kurta
  new Color3(0.88, 0.78, 0.55),  // beige
  new Color3(0.7, 0.15, 0.15),   // crimson
  new Color3(0.12, 0.28, 0.5),   // royal blue
  new Color3(0.92, 0.55, 0.15),  // saffron
  new Color3(0.4, 0.18, 0.55),   // purple
  new Color3(0.18, 0.5, 0.32),   // bottle green
  new Color3(0.82, 0.3, 0.5),    // pink
  new Color3(0.32, 0.32, 0.35),  // grey shirt
  new Color3(0.95, 0.95, 0.95),  // white shirt
];

// Saree palettes — typically more saturated, more contrast with the border.
const SAREE_COLORS = [
  new Color3(0.85, 0.12, 0.18),  // deep red
  new Color3(0.95, 0.55, 0.12),  // marigold orange
  new Color3(0.15, 0.55, 0.32),  // emerald
  new Color3(0.62, 0.18, 0.55),  // magenta
  new Color3(0.92, 0.78, 0.22),  // mustard yellow
  new Color3(0.18, 0.32, 0.62),  // indigo
  new Color3(0.78, 0.12, 0.42),  // hot pink
  new Color3(0.32, 0.18, 0.5),   // royal purple
];

const SKIN_TONES = [
  new Color3(0.78, 0.58, 0.42),
  new Color3(0.72, 0.52, 0.38),
  new Color3(0.65, 0.45, 0.32),
  new Color3(0.55, 0.38, 0.28),
  new Color3(0.85, 0.68, 0.52),
];

const HAIR_COLORS = [
  new Color3(0.05, 0.04, 0.03),  // black
  new Color3(0.10, 0.07, 0.05),  // very dark brown
  new Color3(0.18, 0.12, 0.08),  // dark brown
  new Color3(0.55, 0.55, 0.55),  // grey (older)
];

const PAJAMA_COLORS = [
  new Color3(0.85, 0.82, 0.72),  // off-white pajama
  new Color3(0.18, 0.18, 0.22),  // dark trouser
  new Color3(0.30, 0.22, 0.16),  // brown trouser
  new Color3(0.45, 0.42, 0.38),  // grey
  new Color3(0.12, 0.18, 0.32),  // navy
];

function pickTarget(lane: Lane, side: 1 | -1, rng: Rng): Vector3 {
  const pavCenterZ = side * (lane.roadWidth / 2 + lane.pavementWidth / 2);
  return new Vector3(
    range(rng, -lane.length / 2 + 3, lane.length / 2 - 3),
    0,
    pavCenterZ + range(rng, -lane.pavementWidth * 0.35, lane.pavementWidth * 0.35),
  );
}

/**
 * Build a procedural Indian NPC. Two body templates:
 *  - male:   kurta-pajama (cylinder torso → kurta hem flare → trouser legs)
 *            optional skullcap (topi).
 *  - female: saree (single tapered tube from chest to ankles, separate
 *            shoulder pallu); long hair bun + bindi.
 * Both share head, hair, arms. Heights vary 1.45–1.78m.
 */
function buildProcNpc(scene: Scene, root: Mesh, idx: number, rng: Rng): void {
  const isFemale = rng() > 0.5;
  const skin = pick(rng, SKIN_TONES);
  const hair = pick(rng, HAIR_COLORS);
  const tall = range(rng, isFemale ? 1.45 : 1.6, isFemale ? 1.65 : 1.78);

  // Shared anatomical landmarks
  const headDiameter = 0.22;
  const neckY = tall - headDiameter * 0.5;
  const shoulderY = neckY - 0.05;
  const hipY = tall * 0.48;
  const ankleY = 0.0;

  const skinMat = pbr(scene, `npc_skin_mat_${idx}`, {
    albedo: skin,
    roughness: 0.6,
  });
  const hairMat = pbr(scene, `npc_hair_mat_${idx}`, {
    albedo: hair,
    roughness: 0.5,
  });

  // --- Head
  const head = MeshBuilder.CreateSphere(
    `npc_head_${idx}`,
    { diameter: headDiameter, segments: 12 },
    scene,
  );
  head.position.y = tall - headDiameter * 0.5;
  head.parent = root;
  head.material = skinMat;
  head.isPickable = false;

  // --- Hair: a flatter sphere capping the top half of the head
  const hairCap = MeshBuilder.CreateSphere(
    `npc_hair_${idx}`,
    { diameter: headDiameter * 1.05, segments: 12 },
    scene,
  );
  hairCap.position.y = head.position.y + 0.01;
  hairCap.scaling.y = 0.7;          // squashed cap
  hairCap.parent = root;
  hairCap.material = hairMat;
  hairCap.isPickable = false;
  // Carve out the front face by clipping below — Babylon doesn't have CSG
  // here, so we just rely on the Z-front of the head sphere being skin-coloured
  // and slightly larger than the hair sphere from the front. Good enough at
  // this fidelity.

  // --- Female: long hair down the back + optional bun
  if (isFemale) {
    const longHair = MeshBuilder.CreateCylinder(
      `npc_longhair_${idx}`,
      { diameterTop: 0.18, diameterBottom: 0.14, height: tall * 0.28, tessellation: 10 },
      scene,
    );
    longHair.position.set(0, neckY - tall * 0.13, -0.05);
    longHair.parent = root;
    longHair.material = hairMat;
    longHair.isPickable = false;

    // Bindi — tiny red dot on forehead
    const bindi = MeshBuilder.CreateSphere(
      `npc_bindi_${idx}`,
      { diameter: 0.02, segments: 6 },
      scene,
    );
    bindi.position.set(0, head.position.y + 0.04, 0.105);
    bindi.parent = root;
    bindi.material = pbr(scene, `npc_bindi_mat_${idx}`, {
      albedo: new Color3(0.85, 0.05, 0.1),
      roughness: 0.4,
    });
    bindi.isPickable = false;
  }

  // --- Optional male topi (white prayer cap) for visual variety
  if (!isFemale && rng() < 0.25) {
    const topi = MeshBuilder.CreateCylinder(
      `npc_topi_${idx}`,
      { diameterTop: headDiameter * 0.95, diameterBottom: headDiameter, height: 0.07, tessellation: 14 },
      scene,
    );
    topi.position.y = head.position.y + headDiameter * 0.5 + 0.025;
    topi.parent = root;
    topi.material = pbr(scene, `npc_topi_mat_${idx}`, {
      albedo: new Color3(0.95, 0.95, 0.92),
      roughness: 0.85,
    });
    topi.isPickable = false;
  }

  // --- Torso (different geometry per gender)
  if (isFemale) {
    const sareeColor = pick(rng, SAREE_COLORS);
    const sareeMat = pbr(scene, `npc_saree_mat_${idx}`, {
      albedo: sareeColor,
      roughness: 0.8,
    });
    // Saree skirt: tapered cylinder from waist to ankle
    const skirt = MeshBuilder.CreateCylinder(
      `npc_saree_skirt_${idx}`,
      { diameterTop: 0.34, diameterBottom: 0.46, height: hipY, tessellation: 14 },
      scene,
    );
    skirt.position.y = hipY * 0.5;
    skirt.parent = root;
    skirt.material = sareeMat;
    skirt.isPickable = false;

    // Choli (blouse) — short shoulder piece
    const choli = MeshBuilder.CreateCylinder(
      `npc_choli_${idx}`,
      { diameterTop: 0.36, diameterBottom: 0.38, height: 0.32, tessellation: 12 },
      scene,
    );
    choli.position.y = hipY + 0.16;
    choli.parent = root;
    choli.material = sareeMat;
    choli.isPickable = false;

    // Pallu — diagonal sash across one shoulder
    const pallu = MeshBuilder.CreateBox(
      `npc_pallu_${idx}`,
      { width: 0.42, height: tall * 0.55, depth: 0.04 },
      scene,
    );
    pallu.position.set(0.06, hipY + tall * 0.18, -0.12);
    pallu.rotation.z = -0.18;
    pallu.parent = root;
    pallu.material = sareeMat;
    pallu.isPickable = false;
  } else {
    const kurtaColor = pick(rng, KURTA_COLORS);
    const pajamaColor = pick(rng, PAJAMA_COLORS);
    const kurtaMat = pbr(scene, `npc_kurta_mat_${idx}`, {
      albedo: kurtaColor,
      roughness: 0.85,
    });
    const pajamaMat = pbr(scene, `npc_pajama_mat_${idx}`, {
      albedo: pajamaColor,
      roughness: 0.85,
    });

    // Pajama / trouser legs — two separate cylinders
    for (const sx of [-1, 1]) {
      const leg = MeshBuilder.CreateCylinder(
        `npc_leg_${idx}_${sx}`,
        { diameter: 0.13, height: hipY, tessellation: 10 },
        scene,
      );
      leg.position.set(sx * 0.08, hipY * 0.5, 0);
      leg.parent = root;
      leg.material = pajamaMat;
      leg.isPickable = false;
    }

    // Kurta torso: cylinder that flares slightly toward the hip hem.
    // Hem extends ~10cm below the hip line, signature long-kurta look.
    const torso = MeshBuilder.CreateCylinder(
      `npc_torso_${idx}`,
      { diameterTop: 0.30, diameterBottom: 0.42, height: tall * 0.42, tessellation: 14 },
      scene,
    );
    torso.position.y = hipY + tall * 0.42 * 0.5 - 0.1;
    torso.parent = root;
    torso.material = kurtaMat;
    torso.isPickable = false;
  }

  // --- Arms (both genders — short visible sleeves + skin forearm)
  const upperColor = isFemale ? null : pick(rng, KURTA_COLORS); // sleeve match
  for (const sx of [-1, 1]) {
    const arm = MeshBuilder.CreateCylinder(
      `npc_arm_${idx}_${sx}`,
      { diameter: 0.075, height: tall * 0.42, tessellation: 8 },
      scene,
    );
    arm.position.set(sx * 0.21, shoulderY - tall * 0.21, 0);
    arm.parent = root;
    arm.material = skinMat;
    arm.isPickable = false;

    // Short sleeve cap covering the top third of the arm — matches torso
    if (upperColor !== null) {
      const sleeve = MeshBuilder.CreateCylinder(
        `npc_sleeve_${idx}_${sx}`,
        { diameter: 0.10, height: tall * 0.18, tessellation: 8 },
        scene,
      );
      sleeve.position.set(sx * 0.21, shoulderY - tall * 0.09, 0);
      sleeve.parent = root;
      sleeve.material = pbr(scene, `npc_sleeve_mat_${idx}_${sx}`, {
        albedo: upperColor,
        roughness: 0.85,
      });
      sleeve.isPickable = false;
    }
  }

  // --- Mustache (some men)
  if (!isFemale && rng() < 0.4) {
    const mustache = MeshBuilder.CreateBox(
      `npc_mustache_${idx}`,
      { width: 0.07, height: 0.012, depth: 0.025 },
      scene,
    );
    mustache.position.set(0, head.position.y - 0.025, 0.10);
    mustache.parent = root;
    mustache.material = hairMat;
    mustache.isPickable = false;
  }

  // Reference to silence unused-var warnings on landmarks not consumed above.
  void ankleY;
}

export function spawnCrowd(
  scene: Scene,
  lane: Lane,
  count: number,
  assets: AssetLibrary,
): Crowd {
  const rng = mulberry32(42);
  const npcs: Npc[] = [];

  // The npc_0..npc_4 Meshy templates are picked round-robin (with seed-driven
  // jitter so the same seed gives the same crowd). If all five are missing —
  // e.g. a fresh checkout that hasn't pulled the binaries yet — we fall back
  // to the procedural builder so the scene still populates.
  const templateKeys = ["npc_0", "npc_1", "npc_2", "npc_3", "npc_4"];
  for (let i = 0; i < count; i++) {
    const side = (rng() > 0.5 ? 1 : -1) as 1 | -1;

    let root: TransformNode;
    let usingModel = false;

    // Shuffle template order per-spawn so adjacent NPCs don't always look
    // identical even when count is small.
    const shuffled = [...templateKeys].sort(() => rng() - 0.5);
    let inst = null;
    for (const k of shuffled) {
      inst = instantiateModel(assets, k, scene, `npc_${i}`);
      if (inst) break;
    }

    if (inst) {
      root = inst.root;
      usingModel = true;
      // Apply a small per-NPC scale jitter so identical templates don't
      // visually clone-stamp.
      const sJitter = 0.94 + rng() * 0.12;
      root.scaling.scaleInPlace(sJitter);
      // If the glb came with a walk cycle (our scripts/rig_npc.py adds one
      // for the otherwise-static Meshy exports), start it looping at a
      // randomised phase so adjacent NPCs aren't lock-stepped.
      const walk =
        inst.animations.find((a) => /walk/i.test(a.name)) ??
        inst.animations[0];
      if (walk) {
        walk.start(true);
        walk.goToFrame(rng() * (walk.to - walk.from) + walk.from);
      }
    } else {
      root = new Mesh(`npc_${i}`, scene);
      buildProcNpc(scene, root as Mesh, i, rng);
    }

    // Cast shadows from every renderable mesh under the root.
    for (const m of root.getChildMeshes(false)) castShadow(m);

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

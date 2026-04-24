import { Scene, TransformNode } from "@babylonjs/core";

import type { Lane } from "./lane";
import { AssetLibrary, instantiateModel } from "./assets";
import { castAndReceive } from "./shadows";
import { mulberry32, range, type Rng } from "../util/rand";

function shadowsForInstance(root: TransformNode): void {
  for (const m of root.getChildMeshes(false)) castAndReceive(m);
}

// E-rickshaws: spawn `parked` along the kerb and `moving` on a slow
// back-and-forth along the road. If the model isn't present (`erickshaw.glb`
// missing), this whole module is a no-op — we don't fake e-rickshaws with
// primitives because that would just look like more boxes. Add the model
// and they appear.

export interface Erickshaws {
  moving: { root: TransformNode; dir: 1 | -1; speed: number; xRange: [number, number]; z: number }[];
  lane: Lane;
}

export function spawnErickshaws(
  scene: Scene,
  lane: Lane,
  assets: AssetLibrary,
): Erickshaws {
  const rng: Rng = mulberry32(7777);
  const moving: Erickshaws["moving"] = [];

  const tmpl = assets.models.get("erickshaw");
  if (!tmpl || !tmpl.present) {
    return { moving, lane };
  }

  // Parked — fully off the road, on the pavement side of the kerb. Park them
  // parallel to the lane (nose-in toward the shops would be nicer but needs a
  // proper bay; this is a 2-minute vertical-slice simulation).
  const pavCenterZ = lane.roadWidth / 2 + lane.pavementWidth / 2;
  for (let i = 0; i < 4; i++) {
    const inst = instantiateModel(assets, "erickshaw", scene, `erickshaw_parked_${i}`);
    if (!inst) break;
    const side = i % 2 === 0 ? -1 : 1;
    inst.root.position.set(
      range(rng, -lane.length / 2 + 15, lane.length / 2 - 15),
      0,
      side * pavCenterZ,
    );
    // Face along the lane so they read as parallel-parked (forward=+Z per
    // convention, so rotating +π/2 or -π/2 aligns the vehicle with ±X).
    inst.root.rotation.y =
      (side === -1 ? Math.PI / 2 : -Math.PI / 2) + range(rng, -0.08, 0.08);
    shadowsForInstance(inst.root);
  }

  // Moving — drive slowly along one side of the road. Back-and-forth within
  // the lane bounds; no proper traffic sim for v0.2.
  for (let i = 0; i < 2; i++) {
    const inst = instantiateModel(assets, "erickshaw", scene, `erickshaw_moving_${i}`);
    if (!inst) break;
    const dir = (i === 0 ? 1 : -1) as 1 | -1;
    const z = dir === 1 ? -lane.roadWidth / 4 : lane.roadWidth / 4;
    const xStart = dir === 1 ? -lane.length / 2 + 10 : lane.length / 2 - 10;
    inst.root.position.set(xStart, 0, z);
    // Forward=+Z per convention; rotate ±π/2 so forward aligns with ±X.
    inst.root.rotation.y = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    shadowsForInstance(inst.root);

    moving.push({
      root: inst.root,
      dir,
      speed: range(rng, 2.5, 3.5),
      xRange: [-lane.length / 2 + 5, lane.length / 2 - 5],
      z,
    });

    const run = inst.animations.find((a) => /run|drive|idle/i.test(a.name));
    run?.start(true);
  }

  return { moving, lane };
}

export function updateErickshaws(e: Erickshaws, dt: number): void {
  for (const m of e.moving) {
    m.root.position.x += m.dir * m.speed * dt;
    if (m.dir === 1 && m.root.position.x > m.xRange[1]) {
      m.dir = -1;
      m.root.rotation.y = -Math.PI / 2;
    } else if (m.dir === -1 && m.root.position.x < m.xRange[0]) {
      m.dir = 1;
      m.root.rotation.y = Math.PI / 2;
    }
  }
}

// A tiny HUD-friendly summary callers can log to help the user see whether
// models loaded.
export function summarize(assets: AssetLibrary): string {
  return `models: ${assets.loaded.length} loaded (${assets.loaded.join(
    ", ",
  ) || "-"}), ${assets.missing.length} missing (${assets.missing.join(", ") || "-"})`;
}

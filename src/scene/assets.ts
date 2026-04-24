import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
  LoadAssetContainerAsync,
  Scene,
  TransformNode,
} from "@babylonjs/core";

// Register the glTF loader. Side-effect import; must happen once before any
// loader call.
import "@babylonjs/loaders/glTF";

export interface LoadedModel {
  name: string;
  /**
   * A loaded AssetContainer. We DON'T add these to the scene directly — we
   * call `instantiateModelsToScene` on it to create independent live copies
   * (handles skeletons + animation retargeting properly for rigged models).
   */
  container: AssetContainer | null;
  /**
   * Applied to every instance at spawn (scale, yaw, auto-ground).
   */
  transform: {
    scale: number;
    yawOffset: number;
    yOffset: number | "auto" | null;
  };
  present: boolean;
}

export interface ModelManifestEntry {
  key: string;
  file: string;
  scale?: number;
  yOffset?: number;
  yawOffset?: number;
  /** default true — shift bbox min.y to 0 if no explicit yOffset given */
  autoGround?: boolean;
}

export interface AssetLibrary {
  models: Map<string, LoadedModel>;
  loaded: string[];
  missing: string[];
}

export async function loadAssets(
  scene: Scene,
  manifest: ModelManifestEntry[],
  baseUrl: string,
  onStep: (done: number, total: number, label: string) => void = () => {},
): Promise<AssetLibrary> {
  const models = new Map<string, LoadedModel>();
  const loaded: string[] = [];
  const missing: string[] = [];

  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i];
    onStep(i, manifest.length, `loading ${entry.file}`);

    const url = baseUrl + entry.file;
    let exists = false;
    try {
      const res = await fetch(url, { method: "HEAD" });
      exists = res.ok;
    } catch (e) {
      console.warn(`[assets] HEAD ${url} failed:`, e);
      exists = false;
    }

    const transform = {
      scale: entry.scale ?? 1,
      yawOffset: entry.yawOffset ?? 0,
      yOffset: (entry.yOffset ?? (entry.autoGround === false ? null : "auto")) as number | "auto" | null,
    };

    if (!exists) {
      missing.push(entry.key);
      models.set(entry.key, { name: entry.key, container: null, transform, present: false });
      continue;
    }

    try {
      const container = await LoadAssetContainerAsync(url, scene);
      // Stop any animation groups on the template so they don't play globally.
      for (const g of container.animationGroups) g.stop();

      models.set(entry.key, {
        name: entry.key,
        container,
        transform,
        present: true,
      });
      loaded.push(entry.key);
    } catch (err) {
      console.warn(`[assets] failed to load ${entry.file}:`, err);
      missing.push(entry.key);
      models.set(entry.key, { name: entry.key, container: null, transform, present: false });
    }
  }

  onStep(manifest.length, manifest.length, "assets ready");
  return { models, loaded, missing };
}

export interface ModelInstance {
  root: TransformNode;
  animations: AnimationGroup[];
}

export function instantiateModel(
  lib: AssetLibrary,
  key: string,
  scene: Scene,
  name: string,
): ModelInstance | null {
  const tmpl = lib.models.get(key);
  if (!tmpl || !tmpl.present || !tmpl.container) return null;

  // instantiateModelsToScene clones mesh + skeleton + animationGroups as
  // an independent set. Pass doNotInstantiate so skinned meshes are cloned
  // rather than gpu-instanced (required for independent pose animation).
  const result = tmpl.container.instantiateModelsToScene(
    (n) => `${name}_${n}`,
    /*cloneMaterials=*/ false,
    { doNotInstantiate: true },
  );

  const inner = (result.rootNodes[0] ?? null) as TransformNode | null;
  if (!inner) return null;

  // Three-level wrap so per-model correction actually sticks, even for
  // glTF-loaded nodes that come with a non-null rotationQuaternion (Babylon
  // ignores .rotation Euler when .rotationQuaternion is set — that's why
  // setting yawOffset on the inner directly was a silent no-op for both the
  // CesiumMan NPC and the Meshy e-rickshaw).
  //
  //   outer   — game code owns this (position / yaw-from-motion)
  //   corr    — per-model correction (yawOffset, scale, y-offset)
  //   inner   — the loaded glTF root, keep its rotationQuaternion untouched
  const outer = new TransformNode(name, scene);
  const corr = new TransformNode(`${name}__corr`, scene);
  corr.parent = outer;
  inner.parent = corr;
  inner.name = `${name}__inner`;

  corr.scaling.setAll(tmpl.transform.scale);
  corr.rotation.y = tmpl.transform.yawOffset;

  if (tmpl.transform.yOffset === "auto") {
    outer.computeWorldMatrix(true);
    const bb = (outer as unknown as AbstractMesh).getHierarchyBoundingVectors(true);
    const minY = bb.min.y;
    if (isFinite(minY) && Math.abs(minY) > 0.001) {
      corr.position.y -= minY;
    }
  } else if (typeof tmpl.transform.yOffset === "number") {
    corr.position.y += tmpl.transform.yOffset;
  }

  return { root: outer, animations: result.animationGroups };
}

export const MANIFEST: ModelManifestEntry[] = [
  { key: "cow",               file: "cow.glb" },
  // The Meshy-exported erickshaw is authored with forward = local -X (what
  // looked like a windshield in the top-down render turned out to be the
  // rear). yawOffset = -π/2 sends local -X to world +Z before spawn-time
  // ±π/2 rotations align the vehicle with the lane.
  { key: "erickshaw",         file: "erickshaw.glb",         scale: 1.0, yawOffset: -Math.PI / 2 },
  // npc_male_kurta + npc_female_saree intentionally NOT listed: the only
  // human glb we had (Khronos CesiumMan for npc_male_kurta) read as a
  // robot/astronaut, not an Indian shopper. With both unlisted the loader
  // falls through to crowd.ts's procedural builder, which now renders
  // kurta-pajama men + saree-clad women with hair, bindis, topis, mustaches.
  // Drop a proper rigged Indian glb in public/models/ and re-add the entry
  // here to upgrade.
  { key: "auto_rickshaw",     file: "auto_rickshaw.glb" },
  { key: "scooter",           file: "scooter.glb" },
];

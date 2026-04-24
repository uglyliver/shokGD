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
  _scene: Scene,
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

  const root = (result.rootNodes[0] ?? null) as TransformNode | null;
  if (!root) return null;
  root.name = name;

  // Apply per-model transform.
  const s = tmpl.transform.scale;
  root.scaling.setAll(s);
  root.rotation.y += tmpl.transform.yawOffset;

  // Auto-ground or explicit offset.
  if (tmpl.transform.yOffset === "auto") {
    // getHierarchyBoundingVectors forces world-matrix compute on all
    // descendants, so min.y is accurate for Meshy-style models whose
    // root+children have unapplied transforms.
    root.computeWorldMatrix(true);
    const bb = (root as AbstractMesh).getHierarchyBoundingVectors(true);
    const minY = bb.min.y;
    if (isFinite(minY) && Math.abs(minY) > 0.001) {
      root.position.y -= minY;
    }
  } else if (typeof tmpl.transform.yOffset === "number") {
    root.position.y += tmpl.transform.yOffset;
  }

  return { root, animations: result.animationGroups };
}

export const MANIFEST: ModelManifestEntry[] = [
  { key: "cow",               file: "cow.glb" },
  // Scale 1.0 (as-exported) — the Meshy 'shaw is roughly real-world-sized,
  // we just needed auto-ground to stop it sinking through the road.
  { key: "erickshaw",         file: "erickshaw.glb",         scale: 1.0 },
  { key: "npc_male_kurta",    file: "npc_male_kurta.glb" },
  { key: "npc_female_saree",  file: "npc_female_saree.glb" },
  { key: "auto_rickshaw",     file: "auto_rickshaw.glb" },
  { key: "scooter",           file: "scooter.glb" },
];

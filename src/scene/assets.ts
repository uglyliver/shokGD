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

  // Wrap in an outer node so spawn code can assign rotation.y freely without
  // clobbering any per-model authoring-axis correction (yawOffset) or scale.
  const outer = new TransformNode(name, scene);
  inner.parent = outer;
  inner.name = `${name}__inner`;

  // Per-model correction lives on the INNER node — scale, authoring-axis yaw,
  // and the auto-ground y-offset all compose here. That way the outer node
  // starts at origin and callers can freely do `inst.root.position.set(x,0,z)`
  // without undoing the grounding or the yaw correction.
  inner.scaling.setAll(tmpl.transform.scale);
  inner.rotation.y = tmpl.transform.yawOffset;

  if (tmpl.transform.yOffset === "auto") {
    outer.computeWorldMatrix(true);
    const bb = (outer as unknown as AbstractMesh).getHierarchyBoundingVectors(true);
    const minY = bb.min.y;
    if (isFinite(minY) && Math.abs(minY) > 0.001) {
      inner.position.y -= minY;
    }
  } else if (typeof tmpl.transform.yOffset === "number") {
    inner.position.y += tmpl.transform.yOffset;
  }

  return { root: outer, animations: result.animationGroups };
}

export const MANIFEST: ModelManifestEntry[] = [
  { key: "cow",               file: "cow.glb" },
  // The Meshy-exported erickshaw is authored with forward = local -X (its
  // longest bbox axis is X but the vehicle faces the negative direction of
  // it). yawOffset=π/2 sends local -X to the project's +Z forward so the
  // spawn-time ±π/2 yaw aligns it with the lane.
  { key: "erickshaw",         file: "erickshaw.glb",         scale: 1.0, yawOffset: Math.PI / 2 },
  { key: "npc_male_kurta",    file: "npc_male_kurta.glb" },
  { key: "npc_female_saree",  file: "npc_female_saree.glb" },
  { key: "auto_rickshaw",     file: "auto_rickshaw.glb" },
  { key: "scooter",           file: "scooter.glb" },
];

import {
  AbstractMesh,
  AnimationGroup,
  Node,
  Scene,
  SceneLoader,
  TransformNode,
} from "@babylonjs/core";

// Register the glTF loader. Side-effect import; must happen once before any
// ImportMeshAsync call.
import "@babylonjs/loaders/glTF";

export interface LoadedModel {
  name: string;
  /** Root node of the imported hierarchy. Kept disabled — we clone from it. */
  root: AbstractMesh | null;
  animations: AnimationGroup[];
  /** true if we actually loaded a file; false if absent/errored. */
  present: boolean;
}

export interface ModelManifestEntry {
  /** Key used in code, e.g. "cow", "erickshaw". */
  key: string;
  /** Filename within public/models/, e.g. "cow.glb". */
  file: string;
  /** Uniform scale applied to the root after load. */
  scale?: number;
  /** Explicit Y-offset applied after load. When set, disables auto-ground. */
  yOffset?: number;
  /** Yaw offset in radians — apply if model's "forward" is not +Z. */
  yawOffset?: number;
  /**
   * If true (default), shift the model up so its bounding box min.y sits at
   * 0 after scaling. Prevents Meshy-style pivoted-at-center models from
   * being half-buried. Set false when the model's pivot is intentional
   * (e.g., overhead signs that hang from y=0).
   */
  autoGround?: boolean;
}

export interface AssetLibrary {
  models: Map<string, LoadedModel>;
  /** Keys that loaded from file. */
  loaded: string[];
  /** Keys that were requested but absent or errored. */
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

    // HEAD-check first so absent files don't produce scary loader errors.
    // baseUrl may be a root-relative path (e.g. "/shokGD/models/") — fetch
    // handles that fine; we just concatenate rather than using `new URL(..)`
    // which requires an absolute base.
    const url = baseUrl + entry.file;
    let exists = false;
    try {
      const res = await fetch(url, { method: "HEAD" });
      exists = res.ok;
    } catch (e) {
      console.warn(`[assets] HEAD ${url} failed:`, e);
      exists = false;
    }

    if (!exists) {
      missing.push(entry.key);
      models.set(entry.key, {
        name: entry.key,
        root: null,
        animations: [],
        present: false,
      });
      continue;
    }

    try {
      const result = await SceneLoader.ImportMeshAsync(
        "",
        baseUrl,
        entry.file,
        scene,
      );
      const root = result.meshes[0] ?? null;
      if (!root) throw new Error("no meshes in file");

      if (entry.scale != null) root.scaling.setAll(entry.scale);
      if (entry.yawOffset != null) root.rotation.y += entry.yawOffset;

      // Auto-ground: shift up so bbox.min.y = 0 after scaling. Meshy and
      // many other DCC exports center the pivot inside the mesh, which
      // sinks the model through the floor otherwise. Explicit yOffset wins.
      if (entry.yOffset != null) {
        root.position.y += entry.yOffset;
      } else if (entry.autoGround !== false) {
        root.computeWorldMatrix(true);
        const bb = root.getHierarchyBoundingVectors(true);
        const minY = bb.min.y;
        if (isFinite(minY) && Math.abs(minY) > 0.001) {
          root.position.y -= minY;
        }
      }

      // Keep the template disabled; we clone it for each live instance.
      root.setEnabled(false);
      for (const m of result.meshes) {
        m.isPickable = false;
        m.checkCollisions = false;
      }
      for (const anim of result.animationGroups) anim.stop();

      models.set(entry.key, {
        name: entry.key,
        root,
        animations: result.animationGroups,
        present: true,
      });
      loaded.push(entry.key);
    } catch (err) {
      console.warn(`[assets] failed to load ${entry.file}:`, err);
      missing.push(entry.key);
      models.set(entry.key, {
        name: entry.key,
        root: null,
        animations: [],
        present: false,
      });
    }
  }

  onStep(manifest.length, manifest.length, "assets ready");
  return { models, loaded, missing };
}

export interface ModelInstance {
  root: TransformNode;
  animations: AnimationGroup[];
}

// Clone a loaded template into a live instance. Returns null if the template
// is absent, so callers can fall back to a primitive.
export function instantiateModel(
  lib: AssetLibrary,
  key: string,
  _scene: Scene,
  name: string,
): ModelInstance | null {
  const tmpl = lib.models.get(key);
  if (!tmpl || !tmpl.present || !tmpl.root) return null;

  const cloned: Node | null = tmpl.root.instantiateHierarchy(null, {
    doNotInstantiate: false,
  });
  if (!cloned) return null;

  cloned.name = name;
  (cloned as AbstractMesh).setEnabled(true);

  const anims: AnimationGroup[] = [];
  for (const g of tmpl.animations) {
    const clone = g.clone(`${name}_${g.name}`, () => cloned);
    if (clone) anims.push(clone);
  }

  return { root: cloned as unknown as TransformNode, animations: anims };
}

export const MANIFEST: ModelManifestEntry[] = [
  { key: "cow",               file: "cow.glb" },
  // Meshy e-rickshaw: scaled to read as a real-world ~2 m tall vehicle; the
  // auto-ground pass in loadAssets handles the sunk-into-road issue.
  { key: "erickshaw",         file: "erickshaw.glb",         scale: 0.5 },
  { key: "npc_male_kurta",    file: "npc_male_kurta.glb" },
  { key: "npc_female_saree",  file: "npc_female_saree.glb" },
  { key: "auto_rickshaw",     file: "auto_rickshaw.glb" },
  { key: "scooter",           file: "scooter.glb" },
];

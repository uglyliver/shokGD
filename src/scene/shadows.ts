import { AbstractMesh, Scene, ShadowGenerator } from "@babylonjs/core";

/**
 * Get the scene-wide shadow generator stashed by game.ts. Returns null if
 * shadows haven't been wired up (e.g. a unit test scene).
 */
export function getShadowGen(scene: Scene): ShadowGenerator | null {
  return (scene as unknown as { __shadowGen?: ShadowGenerator }).__shadowGen ?? null;
}

/** Mark a mesh as a shadow caster. Cheap no-op if shadows aren't on. */
export function castShadow(mesh: AbstractMesh): void {
  const gen = getShadowGen(mesh.getScene());
  gen?.addShadowCaster(mesh, /*includeDescendants=*/ true);
}

/** Mark a mesh as a shadow receiver. */
export function receiveShadow(mesh: AbstractMesh): void {
  mesh.receiveShadows = true;
}

/** Most scene meshes both cast and receive — convenience for that. */
export function castAndReceive(mesh: AbstractMesh): void {
  castShadow(mesh);
  receiveShadow(mesh);
}

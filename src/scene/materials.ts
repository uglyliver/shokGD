import { Color3, PBRMaterial, Scene, Texture } from "@babylonjs/core";

interface PbrOpts {
  /** Base albedo color. Defaults to white. Ignored if albedoTexture given. */
  albedo?: Color3;
  /** Albedo texture (replaces albedoColor). */
  albedoTexture?: Texture;
  /** 0 = dielectric, 1 = pure metal. Default 0. */
  metallic?: number;
  /** 0 = mirror, 1 = fully diffuse matte. Default 0.85 (typical wall). */
  roughness?: number;
  /** Self-emission color. Useful for sign panels under low light. */
  emissive?: Color3;
  /** Whether to disable specular reflections (kill shine). */
  flat?: boolean;
}

/**
 * Make a PBRMaterial with a simple metallic/roughness setup. Wraps the verbose
 * Babylon constructor so callers stay one-liners. Most surfaces in the gali
 * are non-metallic and rough — the defaults reflect that.
 */
export function pbr(scene: Scene, name: string, opts: PbrOpts): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  if (opts.albedoTexture) {
    m.albedoTexture = opts.albedoTexture;
  } else {
    m.albedoColor = opts.albedo ?? new Color3(1, 1, 1);
  }
  m.metallic = opts.metallic ?? 0;
  m.roughness = opts.roughness ?? 0.85;
  if (opts.emissive) m.emissiveColor = opts.emissive;
  if (opts.flat) {
    m.disableLighting = false;
    m.environmentIntensity = 0;
  }
  // PBR's default 1.0 specular intensity reads as a uniform sheen on every
  // matte surface — kill it for non-metals so painted walls don't look wet.
  if ((opts.metallic ?? 0) < 0.1) m.metallicF0Factor = 0.2;
  return m;
}

import type {
  BufferGeometry,
  Material,
  ShaderMaterial,
} from "@iwsdk/core";

export const ELECTRICITY_BRUSH_GUID =
  "f6e85de3-6dcc-4e7f-87fd-cee8c3d25d51";
export const ELECTRICITY_DISPLACEMENT_MODS = [1, 1.333, 1.77] as const;

interface UniformHolder {
  value: unknown;
}

const electricityMaterials = new WeakMap<ShaderMaterial, ShaderMaterial[]>();

/** Recreates the three Unity passes used by the Electricity brush. */
export function createBrushRenderMaterial(
  brushGuid: string,
  source: Material,
  sharedUniforms: Record<string, UniformHolder> = {},
): Material | Material[] {
  if (
    brushGuid.toLowerCase() !== ELECTRICITY_BRUSH_GUID ||
    !("uniforms" in source)
  ) {
    return source;
  }
  const shader = source as ShaderMaterial;
  const cached = electricityMaterials.get(shader);
  if (cached) {
    return cached;
  }
  const passes = ELECTRICITY_DISPLACEMENT_MODS.map((mod) => {
    const material = shader.clone();
    for (const [name, holder] of Object.entries(sharedUniforms)) {
      material.uniforms[name] = holder;
    }
    material.uniforms.u_DisplacementMod = { value: mod };
    return material;
  });
  electricityMaterials.set(shader, passes);
  return passes;
}

export function applyBrushRenderGroups(
  geometry: BufferGeometry,
  indexCount: number,
  material: Material | Material[],
): void {
  geometry.clearGroups();
  if (!Array.isArray(material)) {
    return;
  }
  for (let index = 0; index < material.length; index += 1) {
    geometry.addGroup(0, indexCount, index);
  }
}

import {
  type BufferGeometry,
  type Material,
  type ShaderMaterial,
} from "@iwsdk/core";
import {
  applyTiltBrushRenderGroups,
  createTiltBrushRenderMaterial,
  TOON_BRUSH_GUID,
  TUBE_TOON_INVERTED_BRUSH_GUID,
} from "three-icosa";
export const ELECTRICITY_BRUSH_GUID =
  "f6e85de3-6dcc-4e7f-87fd-cee8c3d25d51";
export const ELECTRICITY_DISPLACEMENT_MODS = [1, 1.333, 1.77] as const;
export { TOON_BRUSH_GUID, TUBE_TOON_INVERTED_BRUSH_GUID };

interface UniformHolder {
  value: unknown;
}

const electricityMaterials = new WeakMap<ShaderMaterial, ShaderMaterial[]>();
const toonMaterials = new WeakMap<ShaderMaterial, ShaderMaterial[]>();
const tubeToonInvertedMaterials = new WeakMap<
  ShaderMaterial,
  ShaderMaterial[]
>();

/** Recreates the three Unity passes used by the Electricity brush. */
export function createBrushRenderMaterial(
  brushGuid: string,
  source: Material,
  sharedUniforms: Record<string, UniformHolder> = {},
): Material | Material[] {
  if (!("uniforms" in source)) {
    return source;
  }
  const shader = source as ShaderMaterial;
  const normalizedGuid = brushGuid.toLowerCase();
  if (normalizedGuid === TUBE_TOON_INVERTED_BRUSH_GUID) {
    const cached = tubeToonInvertedMaterials.get(shader);
    if (cached) {
      return cached;
    }
    const passes = createTiltBrushRenderMaterial(
      brushGuid,
      shader,
      sharedUniforms,
    ) as ShaderMaterial[];
    tubeToonInvertedMaterials.set(shader, passes);
    return passes;
  }
  if (normalizedGuid === TOON_BRUSH_GUID) {
    const cached = toonMaterials.get(shader);
    if (cached) {
      return cached;
    }
    const passes = createTiltBrushRenderMaterial(
      brushGuid,
      shader,
      sharedUniforms,
    ) as ShaderMaterial[];
    toonMaterials.set(shader, passes);
    return passes;
  }
  if (normalizedGuid !== ELECTRICITY_BRUSH_GUID) {
    return source;
  }
  const cached = electricityMaterials.get(shader);
  if (cached) {
    return cached;
  }
  const passes = ELECTRICITY_DISPLACEMENT_MODS.map((mod) => {
    const material = cloneWithSharedUniforms(shader, sharedUniforms);
    material.uniforms.u_DisplacementMod = { value: mod };
    return material;
  });
  electricityMaterials.set(shader, passes);
  return passes;
}

function cloneWithSharedUniforms(
  source: ShaderMaterial,
  sharedUniforms: Record<string, UniformHolder>,
): ShaderMaterial {
  const material = source.clone();
  for (const [name, holder] of Object.entries(sharedUniforms)) {
    material.uniforms[name] = holder;
  }
  return material;
}

export function applyBrushRenderGroups(
  geometry: BufferGeometry,
  indexCount: number,
  material: Material | Material[],
): void {
  applyTiltBrushRenderGroups(geometry, indexCount, material);
}

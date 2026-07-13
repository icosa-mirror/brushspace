import {
  BackSide,
  FrontSide,
  type BufferGeometry,
  type Material,
  type ShaderMaterial,
} from "@iwsdk/core";
export const ELECTRICITY_BRUSH_GUID =
  "f6e85de3-6dcc-4e7f-87fd-cee8c3d25d51";
export const ELECTRICITY_DISPLACEMENT_MODS = [1, 1.333, 1.77] as const;
export const TOON_BRUSH_GUID = "4391385a-df73-4396-9e33-31e4e4930b27";
export const TUBE_TOON_INVERTED_BRUSH_GUID =
  "9871385a-df73-4396-9e33-31e4e4930b27";

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
  if (
    !("uniforms" in source)
  ) {
    return source;
  }
  const shader = source as ShaderMaterial;
  if (brushGuid.toLowerCase() === TUBE_TOON_INVERTED_BRUSH_GUID) {
    const cached = tubeToonInvertedMaterials.get(shader);
    if (cached) {
      return cached;
    }
    const base = cloneWithSharedUniforms(shader, sharedUniforms);
    base.side = FrontSide;
    base.uniforms.u_TubeToonPass = { value: 1 };
    base.uniforms.u_TubeToonOutlineSize = { value: 0.05 };
    const color = cloneWithSharedUniforms(shader, sharedUniforms);
    color.side = BackSide;
    color.uniforms.u_TubeToonPass = { value: 2 };
    color.uniforms.u_TubeToonOutlineSize = { value: 0.05 };
    const passes = [base, color];
    tubeToonInvertedMaterials.set(shader, passes);
    return passes;
  }
  if (brushGuid.toLowerCase() === TOON_BRUSH_GUID) {
    const cached = toonMaterials.get(shader);
    if (cached) {
      return cached;
    }
    const surface = cloneWithSharedUniforms(shader, sharedUniforms);
    surface.side = FrontSide;
    surface.uniforms.u_ToonOutlinePass = { value: false };
    const outline = cloneWithSharedUniforms(shader, sharedUniforms);
    outline.side = BackSide;
    outline.uniforms.u_ToonOutlinePass = { value: true };
    const passes = [surface, outline];
    toonMaterials.set(shader, passes);
    return passes;
  }
  if (brushGuid.toLowerCase() !== ELECTRICITY_BRUSH_GUID) {
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
  geometry.clearGroups();
  if (!Array.isArray(material)) {
    return;
  }
  for (let index = 0; index < material.length; index += 1) {
    geometry.addGroup(0, indexCount, index);
  }
}

import type { BrushInventoryEntry } from "./brush-inventory.js";
import { assetUrl } from "../app/asset-url.js";

export const OPENBRUSH_SHADER_BASE_URL = assetUrl("/openbrush/shaders/");
export const OPENBRUSH_TEXTURE_BASE_URL = assetUrl("/openbrush/textures/");

/** Open Brush export blend modes (IExportableMaterial.cs). */
export type BrushShaderBlending = "opaque" | "cutout" | "additive" | "alpha";

export interface BrushShaderTextureBinding {
  /** GLSL uniform name, e.g. "u_MainTex". */
  uniform: string;
  url: string;
}

export interface BrushShaderMaterialDescriptor {
  guid: string;
  name: string;
  vertexUrl: string;
  fragmentUrl: string;
  textures: BrushShaderTextureBinding[];
  /** Uniform name → float or vec4 value, from manifest float/vector/color params and texture sizes. */
  uniforms: Record<string, number | [number, number, number, number]>;
  blending: BrushShaderBlending;
  transparent: boolean;
  depthWrite: boolean;
  doubleSided: boolean;
}

export interface BrushShaderEligibility {
  eligible: boolean;
  reason?: string;
}

/**
 * A brush can use its exported GLSL program only when the port's generated
 * geometry satisfies the shader's vertex contract. VertDefault consumes
 * position/normal/color/texcoord0, which ribbon/tube geometry provides;
 * particle shaders need packed center/rotation/birth-time data that the
 * geometry generator does not emit yet.
 */
export function getBrushShaderEligibility(
  entry: BrushInventoryEntry | undefined,
): BrushShaderEligibility {
  if (!entry?.shaderAssets) {
    return { eligible: false, reason: "Brush has no extracted GLSL shader assets." };
  }
  if (!entry.shaderAssets.vertexIsDefault) {
    return {
      eligible: false,
      reason: "Brush vertex shader needs vertex data the geometry generator does not emit yet.",
    };
  }
  if (
    entry.geometryFamily !== "ribbon" &&
    entry.geometryFamily !== "emissive" &&
    entry.geometryFamily !== "tube"
  ) {
    return {
      eligible: false,
      reason: `Geometry family "${entry.geometryFamily}" does not satisfy the shader vertex contract yet.`,
    };
  }
  return { eligible: true };
}

export function resolveBrushShaderBlending(blendMode: number): BrushShaderBlending {
  switch (blendMode) {
    case 1:
      return "cutout";
    case 2:
      return "additive";
    case 3:
      return "alpha";
    default:
      return "opaque";
  }
}

export function createBrushShaderMaterialDescriptor(
  entry: BrushInventoryEntry,
  options?: { allowAnyGeometry?: boolean },
): BrushShaderMaterialDescriptor | undefined {
  const assets = entry.shaderAssets;
  if (!assets) {
    return undefined;
  }
  // The eligibility gate exists because OUR generated stroke geometry only
  // suits default-vertex brushes; baked meshes (the intro sketch) carry the
  // original attributes, so any brush shader can run on them.
  if (!options?.allowAnyGeometry && !getBrushShaderEligibility(entry).eligible) {
    return undefined;
  }

  const uniforms: BrushShaderMaterialDescriptor["uniforms"] = {};
  for (const [param, value] of Object.entries(entry.floatParams ?? {})) {
    uniforms[`u_${param}`] = value;
  }
  for (const [param, value] of Object.entries(entry.vectorParams ?? {})) {
    uniforms[`u_${param}`] = [...value] as [number, number, number, number];
  }
  for (const [param, value] of Object.entries(entry.colorParams ?? {})) {
    uniforms[`u_${param}`] = [...value] as [number, number, number, number];
  }
  for (const [param, size] of Object.entries(entry.textureSizes ?? {})) {
    const [width, height] = size;
    if (width > 0 && height > 0) {
      // Unity's <name>_TexelSize convention: (1/w, 1/h, w, h).
      uniforms[`u_${param}_TexelSize`] = [1 / width, 1 / height, width, height];
    }
  }

  const textures: BrushShaderTextureBinding[] = Object.entries(assets.textureFiles)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([param, file]) => ({
      uniform: `u_${param}`,
      url: `${OPENBRUSH_TEXTURE_BASE_URL}${file}`,
    }));

  const blending = resolveBrushShaderBlending(entry.blendMode);
  // The interim 4-sided tube prism has unvalidated winding, so culling would
  // drop visible faces; render tubes double-sided until the SH6 tube rewrite.
  const doubleSided = !entry.enableCull || entry.geometryFamily === "tube";
  return {
    guid: entry.guid,
    name: entry.name,
    vertexUrl: `${OPENBRUSH_SHADER_BASE_URL}${assets.vertexShaderFile}`,
    fragmentUrl: `${OPENBRUSH_SHADER_BASE_URL}${assets.fragmentShaderFile}`,
    textures,
    uniforms,
    blending,
    transparent: blending === "additive" || blending === "alpha",
    depthWrite: blending === "opaque" || blending === "cutout",
    doubleSided,
  };
}

/**
 * Prepares an exported GLSL 1.00 source for compilation as a non-raw
 * three.js ShaderMaterial. Non-raw materials are required for XR: super-three
 * only applies its GLSL3 conversion and OVR_multiview patching (per-view
 * matrix arrays + distinct program cache keys) to non-raw programs — a
 * RawShaderMaterial renders into the multiview framebuffer with a mono
 * program, which is an INVALID_OPERATION and draws nothing in-headset.
 *
 * Three's non-raw prefix already declares the built-in matrix uniforms (and
 * rewrites them to per-view arrays under multiview), so the shader's own
 * declarations must be dropped to avoid duplicate/broken declarations.
 * Derivative functions are core in GLSL ES 3.00, so the old extension
 * directive is dropped too.
 */
export function prepareBrushShaderSource(source: string): string {
  return (
    source
      .replace(
        /^[ \t]*uniform[ \t]+(?:highp[ \t]+|mediump[ \t]+|lowp[ \t]+)?(?:mat4[ \t]+(?:modelViewMatrix|projectionMatrix|viewMatrix|modelMatrix)|mat3[ \t]+normalMatrix|vec3[ \t]+cameraPosition)[ \t]*;[^\n]*\n?/gm,
        "",
      )
      .replace(/^[ \t]*#extension[ \t]+GL_OES_standard_derivatives[^\n]*\n?/gm, "")
      // The particle shaders ship their own mat4 inverse(), legal in the
      // exported GLSL 1.00 but a redeclaration of the built-in once three
      // promotes the source to GLSL ES 3.00 — rename definition and calls.
      .replace(/\binverse\b(?=\s*\()/g, "tb_inverse")
  );
}

/**
 * Scene lighting rig used by the exported shaders, taken verbatim from the
 * official tiltbrush.com viewer export of the "Standard" environment
 * (reference/Support/bin/gltfViewer/geom/ExampleSketch/Untitled.gltf).
 * Matrices are column-major light→world transforms; the shaders derive the
 * light direction as mat3(view * lightWorld) * (0,0,1).
 */
export const OPENBRUSH_SCENE_LIGHT_0_MATRIX: readonly number[] = [
  0.898794, 0.2191856, -0.3796406, 0, -0.4383712, 0.449397, -0.7783785, 0,
  -1.490116e-8, 0.8660254, 0.4999999, 0, 0, 0.021875, 0.05458749, 1,
];
export const OPENBRUSH_SCENE_LIGHT_1_MATRIX: readonly number[] = [
  0.7660444, -0.4924039, -0.4131759, 0, -0.6427876, -0.5868242, -0.4924039, 0,
  8.940697e-8, 0.6427876, -0.7660446, 0, 0, 0.021875, 0.05458749, 1,
];
export const OPENBRUSH_SCENE_LIGHT_0_COLOR: readonly number[] = [
  0.7780392, 0.8156863, 0.9913726, 1,
];
export const OPENBRUSH_SCENE_LIGHT_1_COLOR: readonly number[] = [
  0.4282353, 0.4211765, 0.3458824, 1,
];
export const OPENBRUSH_AMBIENT_LIGHT_COLOR: readonly number[] = [
  0.3921569, 0.3921569, 0.3921569, 1,
];
export const OPENBRUSH_FOG_COLOR: readonly number[] = [0.1647059, 0.1647059, 0.2078431];

/**
 * Unity _Time convention consumed by the animated shaders: (t/20, t, 2t, 3t).
 * Exposed as a pure helper so tests can pin the packing.
 */
export function packBrushShaderTime(
  timeSeconds: number,
): [number, number, number, number] {
  return [timeSeconds / 20, timeSeconds, timeSeconds * 2, timeSeconds * 3];
}

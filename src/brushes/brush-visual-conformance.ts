import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from "@iwsdk/core";
import type { GeneratedBrushGeometry } from "./brush-geometry.js";

import { applyBrushShaderAttributeAliases } from "./brush-shader-library.js";
import {
  compareRgbPixels,
  type PixelDifference,
} from "./brush-pixel-difference.js";

export const BRUSH_VISUAL_CONFORMANCE_PREFIX = "[BrushVisualConformance]";
export const BRUSH_VISUAL_CONFORMANCE_SIZE = 256;

export interface BrushVisualConformanceResult extends PixelDifference {
  passed: boolean;
  bumpPixels: Uint8Array;
  flatPixels: Uint8Array;
}

export interface ParticleVisualConformanceResult {
  passed: boolean;
  coveredPixelRatio: number;
  pixels: Uint8Array;
}

export function runParticleVisualConformance(
  renderer: WebGLRenderer,
  sourceMaterial: ShaderMaterial,
  generated: GeneratedBrushGeometry,
): ParticleVisualConformanceResult {
  if (!generated.packedUvs || !generated.uv1) {
    throw new Error("Particle conformance geometry lacks packed UV channels.");
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(generated.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(generated.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(generated.colors, 4));
  geometry.setAttribute("uv", new BufferAttribute(generated.uvs, 2));
  geometry.setAttribute("a_texcoord0", new BufferAttribute(generated.packedUvs, 4));
  geometry.setAttribute("uv1", new BufferAttribute(generated.uv1, 4));
  geometry.setAttribute("a_texcoord1", new BufferAttribute(generated.uv1, 4));
  geometry.setIndex(new BufferAttribute(generated.indices, 1));
  applyBrushShaderAttributeAliases(geometry);

  const material = sourceMaterial.clone();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-0.3, 0.3, 0.3, -0.3, 0.1, 10);
  camera.position.z = 2;
  camera.updateMatrixWorld(true);
  const target = new WebGLRenderTarget(
    BRUSH_VISUAL_CONFORMANCE_SIZE,
    BRUSH_VISUAL_CONFORMANCE_SIZE,
  );
  const pixels = new Uint8Array(BRUSH_VISUAL_CONFORMANCE_SIZE ** 2 * 4);
  const previousTarget = renderer.getRenderTarget();
  const previousClearColor = renderer.getClearColor(new Color());
  const previousClearAlpha = renderer.getClearAlpha();
  try {
    renderer.setClearColor(0x000000, 0);
    renderPixels(renderer, scene, camera, target, pixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    geometry.dispose();
    material.dispose();
    target.dispose();
  }
  let coveredPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 3) {
      coveredPixels += 1;
    }
  }
  const coveredPixelRatio = coveredPixels / (BRUSH_VISUAL_CONFORMANCE_SIZE ** 2);
  return {
    passed: coveredPixelRatio >= 0.005,
    coveredPixelRatio,
    pixels,
  };
}

export function showParticleVisualConformance(
  result: ParticleVisualConformanceResult,
): void {
  document.getElementById("brush-visual-conformance")?.remove();
  const root = document.createElement("section");
  root.id = "brush-visual-conformance";
  root.style.cssText =
    "position:fixed;inset:16px;z-index:10000;background:#111;color:#eee;padding:16px;font:14px system-ui;overflow:auto";
  const heading = document.createElement("h1");
  heading.textContent = `Smoke particle render: ${result.passed ? "PASS" : "FAIL"}`;
  const details = document.createElement("p");
  details.textContent = `covered ${(result.coveredPixelRatio * 100).toFixed(2)}%`;
  root.append(heading, details, createPixelFigure("Generated Smoke stroke", result.pixels));
  root.dataset.result = result.passed ? "pass" : "fail";
  document.body.append(root);
}

/**
 * Renders the real Open Brush material against a control with only its
 * PerturbNormal call disabled. Geometry, textures, uniforms, camera and
 * lighting remain identical, so the pixel delta isolates bump mapping.
 */
export function runBumpVisualConformance(
  renderer: WebGLRenderer,
  sourceMaterial: ShaderMaterial,
): BrushVisualConformanceResult {
  const bumpMaterial = sourceMaterial.clone();
  const flatMaterial = sourceMaterial.clone();
  const normalCall =
    "vec3 normal = PerturbNormal(v_position.xyz, normalize(v_normal), v_texcoord0);";
  if (!flatMaterial.fragmentShader.includes(normalCall)) {
    bumpMaterial.dispose();
    flatMaterial.dispose();
    throw new Error("Open Brush shader no longer contains the expected bump-normal call.");
  }
  flatMaterial.fragmentShader = flatMaterial.fragmentShader.replace(
    normalCall,
    "vec3 normal = normalize(v_normal);",
  );
  flatMaterial.needsUpdate = true;
  applyConformanceLighting(bumpMaterial);
  applyConformanceLighting(flatMaterial);

  const geometry = createConformanceQuad();
  const mesh = new Mesh(geometry, bumpMaterial);
  mesh.scale.setScalar(0.05);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-0.05, 0.05, 0.05, -0.05, 0.1, 10);
  camera.position.z = 2;
  camera.updateMatrixWorld(true);

  const target = new WebGLRenderTarget(
    BRUSH_VISUAL_CONFORMANCE_SIZE,
    BRUSH_VISUAL_CONFORMANCE_SIZE,
  );
  const bumpPixels = new Uint8Array(BRUSH_VISUAL_CONFORMANCE_SIZE ** 2 * 4);
  const flatPixels = new Uint8Array(BRUSH_VISUAL_CONFORMANCE_SIZE ** 2 * 4);
  const previousTarget = renderer.getRenderTarget();
  const previousClearColor = renderer.getClearColor(new Color());
  const previousClearAlpha = renderer.getClearAlpha();
  try {
    renderer.setClearColor(0x000000, 0);
    renderPixels(renderer, scene, camera, target, bumpPixels);
    mesh.material = flatMaterial;
    renderPixels(renderer, scene, camera, target, flatPixels);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    geometry.dispose();
    bumpMaterial.dispose();
    flatMaterial.dispose();
    target.dispose();
  }

  const difference = compareRgbPixels(bumpPixels, flatPixels);
  return {
    ...difference,
    // Both coverage and magnitude matter: this rejects a few unstable edge
    // pixels while catching the former all-flat PerturbNormal fallback.
    passed:
      difference.changedPixelRatio >= 0.05 &&
      difference.rootMeanSquareDifference >= 1,
    bumpPixels,
    flatPixels,
  };
}

function applyConformanceLighting(material: ShaderMaterial): void {
  // A fixed grazing light makes the real 0.0015 Oil Paint displacement
  // observable without changing its shader strength or texture sampling.
  material.uniforms.u_SceneLight_0_matrix.value = new Matrix4().makeRotationY(
    Math.PI / 3,
  );
  material.uniforms.u_SceneLight_0_color.value = new Vector4(1.5, 1.5, 1.5, 1);
  material.uniforms.u_SceneLight_1_color.value = new Vector4(0, 0, 0, 1);
  material.uniforms.u_ambient_light_color.value = new Vector4(0.03, 0.03, 0.03, 1);
}

export function showBumpVisualConformance(
  result: BrushVisualConformanceResult,
): void {
  document.getElementById("brush-visual-conformance")?.remove();
  const root = document.createElement("section");
  root.id = "brush-visual-conformance";
  root.style.cssText =
    "position:fixed;inset:16px;z-index:10000;background:#111;color:#eee;padding:16px;font:14px system-ui;overflow:auto";
  const heading = document.createElement("h1");
  heading.textContent = `Oil Paint bump A/B: ${result.passed ? "PASS" : "FAIL"}`;
  root.append(heading);
  const details = document.createElement("p");
  details.textContent = `coverage ${(result.comparedPixelRatio * 100).toFixed(2)}% · changed ${(result.changedPixelRatio * 100).toFixed(2)}% · RMS ${result.rootMeanSquareDifference.toFixed(2)} · mean ${result.meanAbsoluteDifference.toFixed(2)}`;
  root.append(details);
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:16px;flex-wrap:wrap";
  row.append(
    createPixelFigure("Bump mapping enabled", result.bumpPixels),
    createPixelFigure("Flat-normal control", result.flatPixels),
  );
  root.append(row);
  root.dataset.result = result.passed ? "pass" : "fail";
  document.body.append(root);
}

function createConformanceQuad(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 4),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 4, 0, 4, 4, 0, 4]), 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  applyBrushShaderAttributeAliases(geometry);
  return geometry;
}

function renderPixels(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: OrthographicCamera,
  target: WebGLRenderTarget,
  pixels: Uint8Array,
): void {
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(
    target,
    0,
    0,
    BRUSH_VISUAL_CONFORMANCE_SIZE,
    BRUSH_VISUAL_CONFORMANCE_SIZE,
    pixels,
  );
}

function createPixelFigure(label: string, pixels: Uint8Array): HTMLElement {
  const figure = document.createElement("figure");
  const canvas = document.createElement("canvas");
  canvas.width = BRUSH_VISUAL_CONFORMANCE_SIZE;
  canvas.height = BRUSH_VISUAL_CONFORMANCE_SIZE;
  canvas.style.cssText = "width:384px;max-width:100%;image-rendering:auto;background:#000";
  const context = canvas.getContext("2d");
  if (context) {
    const flipped = new Uint8ClampedArray(pixels.length);
    const rowBytes = BRUSH_VISUAL_CONFORMANCE_SIZE * 4;
    for (let y = 0; y < BRUSH_VISUAL_CONFORMANCE_SIZE; y += 1) {
      const sourceOffset = y * rowBytes;
      const targetOffset = (BRUSH_VISUAL_CONFORMANCE_SIZE - y - 1) * rowBytes;
      flipped.set(pixels.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
    }
    context.putImageData(
      new ImageData(flipped, BRUSH_VISUAL_CONFORMANCE_SIZE, BRUSH_VISUAL_CONFORMANCE_SIZE),
      0,
      0,
    );
  }
  const caption = document.createElement("figcaption");
  caption.textContent = label;
  figure.append(canvas, caption);
  return figure;
}

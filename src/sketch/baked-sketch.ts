import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from "@iwsdk/core";

import { openBrushInventory } from "../brushes/brush-catalog.js";
import { findBrushByGuid } from "../brushes/brush-inventory.js";
import {
  applyBrushShaderAttributeAliases,
  openBrushShaderLibrary,
} from "../brushes/brush-shader-library.js";

/**
 * Baked-sketch assets: mesh geometry extracted from Open Brush's Unity
 * prefabs (the intro scene, the avatar head), stored as a binary buffer plus
 * a manifest of per-brush-material nodes and rendered with the real brush
 * shaders. See scripts/extract-intro-sketch.mjs and
 * scripts/extract-avatar-head.mjs for the producers.
 */
export interface BakedSketchNode {
  brushGuid: string;
  materialName: string;
  vertexCount: number;
  indexCount: number;
  positionsOffset: number;
  normalsOffset: number;
  colorsOffset: number;
  uv0Offset: number;
  uv0Dimension: number;
  uv1Offset: number;
  uv1Dimension: number;
  indicesOffset: number;
}

export interface BakedSketchManifest {
  nodes: BakedSketchNode[];
}

export function buildBakedSketchGeometry(
  node: BakedSketchNode,
  bin: ArrayBuffer,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array(bin, node.positionsOffset, node.vertexCount * 3),
      3,
    ),
  );
  if (node.normalsOffset >= 0) {
    geometry.setAttribute(
      "normal",
      new BufferAttribute(
        new Float32Array(bin, node.normalsOffset, node.vertexCount * 3),
        3,
      ),
    );
  }
  if (node.colorsOffset >= 0) {
    geometry.setAttribute(
      "color",
      new BufferAttribute(
        new Uint8Array(bin, node.colorsOffset, node.vertexCount * 4),
        4,
        true,
      ),
    );
  }
  if (node.uv0Offset >= 0 && node.uv0Dimension > 0) {
    geometry.setAttribute(
      "uv",
      new BufferAttribute(
        new Float32Array(
          bin,
          node.uv0Offset,
          node.vertexCount * node.uv0Dimension,
        ),
        node.uv0Dimension,
      ),
    );
  }
  if (node.uv1Offset >= 0 && node.uv1Dimension > 0) {
    geometry.setAttribute(
      "uv1",
      new BufferAttribute(
        new Float32Array(
          bin,
          node.uv1Offset,
          node.vertexCount * node.uv1Dimension,
        ),
        node.uv1Dimension,
      ),
    );
  }
  geometry.setIndex(
    new BufferAttribute(
      new Uint32Array(bin, node.indicesOffset, node.indexCount),
      1,
    ),
  );
  applyBrushShaderAttributeAliases(geometry);
  return geometry;
}

export async function resolveBakedSketchMaterial(node: BakedSketchNode) {
  if (node.brushGuid) {
    const entry = findBrushByGuid(openBrushInventory, node.brushGuid);
    if (entry) {
      const material = await openBrushShaderLibrary.load(entry, {
        allowAnyGeometry: true,
      });
      if (material) {
        return material;
      }
    }
  }
  return new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
}

/**
 * Fetches a baked sketch and builds its meshes under a fresh Group (local
 * units are the source sketch's decimeters — callers apply their own scale).
 * Returns undefined when the assets are missing.
 */
export async function loadBakedSketchGroup(
  manifestUrl: string,
  binUrl: string,
  name: string,
): Promise<Group | undefined> {
  const [manifestResponse, binResponse] = await Promise.all([
    fetch(manifestUrl),
    fetch(binUrl),
  ]);
  if (!manifestResponse.ok || !binResponse.ok) {
    return undefined;
  }
  const manifest = (await manifestResponse.json()) as BakedSketchManifest;
  const bin = await binResponse.arrayBuffer();
  const group = new Group();
  group.name = name;
  for (const node of manifest.nodes) {
    const mesh = new Mesh(
      buildBakedSketchGeometry(node, bin),
      await resolveBakedSketchMaterial(node),
    );
    mesh.name = `${name}_${node.materialName}`;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    group.add(mesh);
  }
  return group;
}

/** Disposes the geometries created by loadBakedSketchGroup. */
export function disposeBakedSketchGroup(group: Object3D): void {
  group.removeFromParent();
  for (const child of group.children) {
    (child as Mesh).geometry.dispose();
  }
}

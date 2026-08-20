import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Sphere,
  Vector3,
  type Material,
} from "@iwsdk/core";

import { applyBrushRenderGroups } from "./brush-render-material.js";
import {
  applyBrushShaderAttributeAliases,
  applyBrushShaderSupplementalAttributes,
} from "./brush-shader-library.js";
import type { StrokeBatch } from "./stroke-batch.js";

const boundsMinScratch = new Vector3();
const boundsMaxScratch = new Vector3();

export interface StrokeBatchUploadResult {
  vertexDataUploaded: boolean;
  topologyUploaded: boolean;
  uploadedBytes: number;
}

/**
 * Synchronizes one data-layer batch with its private GPU geometry.
 *
 * Attributes are rebound only when the batch storage grows or its layout
 * changes. Visibility-only changes update the index buffer and aggregate
 * bounds without touching vertex attributes.
 */
export function uploadStrokeBatchGeometry(
  geometry: BufferGeometry,
  batch: StrokeBatch,
  brushGuid: string,
  material: Material | Material[],
): StrokeBatchUploadResult {
  const needsVertexUpload =
    batch.vertexDataDirty || !geometry.getAttribute("position");
  const needsTopologyUpload =
    batch.topologyDirty || needsVertexUpload || !geometry.getIndex();
  let uploadedBytes = 0;

  if (needsVertexUpload) {
    uploadedBytes += bindAttribute(
      geometry,
      "position",
      batch.positions,
      3,
      batch.vertexCount,
    );
    uploadedBytes += bindAttribute(
      geometry,
      "normal",
      batch.normals,
      3,
      batch.vertexCount,
    );
    uploadedBytes += bindAttribute(
      geometry,
      "tangent",
      batch.tangents,
      4,
      batch.vertexCount,
    );
    uploadedBytes += bindAttribute(
      geometry,
      "color",
      batch.colors,
      4,
      batch.vertexCount,
    );
    uploadedBytes += bindAttribute(
      geometry,
      "uv",
      batch.baseUvs,
      2,
      batch.vertexCount,
    );

    applyBrushShaderAttributeAliases(geometry);
    const shaderUv =
      batch.layout.uv0Size === 2
        ? geometry.getAttribute("uv")
        : bindOrUpdateAttribute(batch.uvs, batch.layout.uv0Size);
    geometry.setAttribute("a_texcoord0", shaderUv);

    if (batch.layout.uv1Size > 0) {
      const uv1 = bindOrUpdateAttribute(batch.uv1s, batch.layout.uv1Size);
      geometry.setAttribute("uv1", uv1);
      geometry.setAttribute("a_texcoord1", uv1);
      uploadedBytes += batch.vertexCount * batch.layout.uv1Size * 4;
    } else {
      geometry.deleteAttribute("uv1");
      geometry.deleteAttribute("a_texcoord1");
    }
    if (batch.layout.uv0Size > 2) {
      uploadedBytes += batch.vertexCount * batch.layout.uv0Size * 4;
    }
  }

  if (needsTopologyUpload) {
    const index = geometry.getIndex();
    if (!index || index.array !== batch.indices) {
      geometry.setIndex(bindOrUpdateAttribute(batch.indices, 1));
    } else {
      markUsedRangeUpdated(index, batch.indexCount);
    }
    uploadedBytes += batch.indexCount * 4;
  }

  applyBrushShaderSupplementalAttributes(
    geometry,
    brushGuid,
    batch.vertexCount,
  )?.setUsage(DynamicDrawUsage);
  geometry.setDrawRange(0, batch.indexCount);
  applyBrushRenderGroups(geometry, batch.indexCount, material);
  updateActiveBounds(geometry, batch);
  batch.clearDirtyFlags();

  return {
    vertexDataUploaded: needsVertexUpload,
    topologyUploaded: needsTopologyUpload,
    uploadedBytes,
  };
}

function bindAttribute(
  geometry: BufferGeometry,
  name: string,
  array: Float32Array,
  itemSize: number,
  usedElementCount: number,
): number {
  const current = geometry.getAttribute(name);
  if (current?.array === array && current.itemSize === itemSize) {
    markUsedRangeUpdated(current as BufferAttribute, usedElementCount);
    return usedElementCount * itemSize * array.BYTES_PER_ELEMENT;
  }
  geometry.setAttribute(name, bindOrUpdateAttribute(array, itemSize));
  return usedElementCount * itemSize * array.BYTES_PER_ELEMENT;
}

function bindOrUpdateAttribute(
  array: Float32Array | Uint32Array,
  itemSize: number,
): BufferAttribute {
  const attribute = new BufferAttribute(array, itemSize);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

function markUsedRangeUpdated(
  attribute: BufferAttribute,
  usedElementCount: number,
): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, usedElementCount * attribute.itemSize);
  attribute.needsUpdate = true;
}

function updateActiveBounds(
  geometry: BufferGeometry,
  batch: StrokeBatch,
): void {
  const box = geometry.boundingBox ?? new Box3();
  box.makeEmpty();
  for (const subset of batch.subsets) {
    if (!subset.active) {
      continue;
    }
    const { min, max } = subset.bounds;
    if (
      !Number.isFinite(min[0]) ||
      !Number.isFinite(min[1]) ||
      !Number.isFinite(min[2]) ||
      !Number.isFinite(max[0]) ||
      !Number.isFinite(max[1]) ||
      !Number.isFinite(max[2])
    ) {
      continue;
    }
    box.expandByPoint(boundsMinScratch.set(min[0], min[1], min[2]));
    box.expandByPoint(boundsMaxScratch.set(max[0], max[1], max[2]));
  }
  geometry.boundingBox = box;
  const sphere = geometry.boundingSphere ?? new Sphere();
  if (box.isEmpty()) {
    sphere.center.set(0, 0, 0);
    sphere.radius = 0;
  } else {
    box.getBoundingSphere(sphere);
  }
  geometry.boundingSphere = sphere;
}

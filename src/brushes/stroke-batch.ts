/**
 * Stroke batch geometry — the port of Open Brush's `Batch` vertex storage.
 *
 * Open Brush renders strokes through `BatchManager`: pooled meshes, one pool
 * per brush material, each mesh holding many strokes as vertex ranges
 * ("subsets") inside one shared `GeometryPool`. Draw calls scale with the
 * number of brush materials in use rather than the number of strokes.
 * `Batch.cs` owns the vertex/index arrays and the subset bookkeeping; this
 * module is the equivalent, operating on the same attribute layout the
 * per-stroke path already produces (`BrushGeometryArrays`).
 *
 * Deliberately free of Three.js and ECS types: this is the data layer, and it
 * is exercised directly by unit tests. Uploading these arrays into a
 * `BufferGeometry` is the renderer's job.
 */

import type { BrushGeometryArrays } from "./brush-geometry.js";

/**
 * Vertex-count ceiling for a single batch.
 *
 * Open Brush caps a batch at 15999 verts, or ~2^31 when the `LargeMeshSupport`
 * user flag is set (`Batch.HasSpaceFor`). That low default exists because
 * Unity meshes default to 16-bit indices; WebGL2 always supports 32-bit
 * indices, so the equivalent of `LargeMeshSupport` is permanently on here.
 * The cap is kept far below the 32-bit ceiling anyway: a batch re-uploads its
 * whole vertex buffer when it changes, so unbounded batches would turn a
 * one-stroke edit into a multi-megabyte transfer.
 */
export const MAX_BATCH_VERTICES = 65534;

/** Attribute widths that must agree for strokes to share one batch. */
export interface BatchVertexLayout {
  uv0Size: 2 | 3 | 4;
  uv1Size: 0 | 3 | 4;
}

/** Axis-aligned bounds of a subset, in the batch's (canvas) space. */
export interface SubsetBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * One stroke's slice of a batch — the port of `BatchSubset`.
 *
 * `startVertex`/`vertexCount` and `startIndex`/`indexCount` locate the stroke
 * inside the batch's shared arrays. Subsets are kept sorted by `startVertex`;
 * `StrokeBatch.removeSubset` relies on it, exactly as Open Brush's
 * `Batch.RemoveSubset` does.
 */
export interface BatchSubset {
  strokeGuid: string;
  startVertex: number;
  vertexCount: number;
  startIndex: number;
  indexCount: number;
  /** False when hidden — its indices are zeroed but its storage is retained. */
  active: boolean;
  /** Saved indices while inactive; lazily created (`m_TriangleBackup`). */
  indexBackup?: Uint32Array;
  bounds: SubsetBounds;
}

function createEmptyBounds(): SubsetBounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function growFloat32(
  existing: Float32Array<ArrayBuffer>,
  required: number,
): Float32Array<ArrayBuffer> {
  if (existing.length >= required) {
    return existing;
  }
  let capacity = Math.max(existing.length || 1, 1);
  while (capacity < required) {
    capacity *= 2;
  }
  const grown = new Float32Array(capacity);
  grown.set(existing);
  return grown;
}

function growUint32(
  existing: Uint32Array<ArrayBuffer>,
  required: number,
): Uint32Array<ArrayBuffer> {
  if (existing.length >= required) {
    return existing;
  }
  let capacity = Math.max(existing.length || 1, 1);
  while (capacity < required) {
    capacity *= 2;
  }
  const grown = new Uint32Array(capacity);
  grown.set(existing);
  return grown;
}

const INITIAL_VERTEX_CAPACITY = 1024;
const INITIAL_INDEX_CAPACITY = 4096;

/**
 * A single mesh's worth of geometry holding many strokes.
 *
 * Mirrors `Batch.cs`: `addSubset` appends a stroke's geometry and returns its
 * range; `disableSubset`/`enableSubset` hide and restore a stroke by zeroing
 * and restoring its indices (leaving vertices untouched, so no re-upload of
 * vertex data is needed); `removeSubset` drops a stroke, reclaiming storage
 * only when it is the tail of the batch.
 */
export class StrokeBatch {
  readonly layout: BatchVertexLayout;

  positions = new Float32Array(INITIAL_VERTEX_CAPACITY * 3);
  normals = new Float32Array(INITIAL_VERTEX_CAPACITY * 3);
  tangents = new Float32Array(INITIAL_VERTEX_CAPACITY * 4);
  colors = new Float32Array(INITIAL_VERTEX_CAPACITY * 4);
  /** Standard two-component UV channel used by Three.js and exports. */
  baseUvs = new Float32Array(INITIAL_VERTEX_CAPACITY * 2);
  /** Packed shader texcoord0 channel; width is described by `layout`. */
  uvs: Float32Array<ArrayBuffer>;
  uv1s: Float32Array<ArrayBuffer>;
  indices = new Uint32Array(INITIAL_INDEX_CAPACITY);

  vertexCount = 0;
  indexCount = 0;

  /** Sorted by `startVertex` (`Batch.m_Groups`). */
  readonly subsets: BatchSubset[] = [];

  /** Set when vertex data changed and the mesh needs a full re-upload. */
  vertexDataDirty = false;
  /** Set when only indices changed (show/hide) — a cheaper upload. */
  topologyDirty = false;

  constructor(layout: BatchVertexLayout) {
    this.layout = { ...layout };
    this.uvs = new Float32Array(INITIAL_VERTEX_CAPACITY * layout.uv0Size);
    this.uv1s = new Float32Array(
      INITIAL_VERTEX_CAPACITY * Math.max(layout.uv1Size, 1),
    );
  }

  /** True when this batch's attribute widths match the incoming geometry. */
  acceptsLayout(layout: BatchVertexLayout): boolean {
    return (
      this.layout.uv0Size === layout.uv0Size &&
      this.layout.uv1Size === layout.uv1Size
    );
  }

  /**
   * Whether `additionalVertices` more vertices fit (`Batch.HasSpaceFor`). An
   * empty batch always accepts, so a stroke larger than the cap still renders
   * in a batch of its own rather than being dropped.
   */
  hasSpaceFor(additionalVertices: number): boolean {
    if (this.vertexCount === 0) {
      return true;
    }
    return this.vertexCount + additionalVertices <= MAX_BATCH_VERTICES;
  }

  /**
   * Appends a stroke's geometry and returns its subset. Indices are rebased
   * onto the batch's vertex range as they are copied (`AppendTriangleData`).
   */
  addSubset(strokeGuid: string, arrays: BrushGeometryArrays): BatchSubset {
    const { vertexCount, indexCount } = arrays;
    const startVertex = this.vertexCount;
    const startIndex = this.indexCount;

    this.ensureVertexCapacity(startVertex + vertexCount);
    this.ensureIndexCapacity(startIndex + indexCount);

    this.positions.set(
      arrays.positions.subarray(0, vertexCount * 3),
      startVertex * 3,
    );
    this.normals.set(
      arrays.normals.subarray(0, vertexCount * 3),
      startVertex * 3,
    );
    this.tangents.set(
      arrays.tangents.subarray(0, vertexCount * 4),
      startVertex * 4,
    );
    this.colors.set(
      arrays.colors.subarray(0, vertexCount * 4),
      startVertex * 4,
    );
    this.baseUvs.set(
      arrays.uvs.subarray(0, vertexCount * 2),
      startVertex * 2,
    );

    const uv0Size = this.layout.uv0Size;
    this.uvs.set(
      selectUvSource(arrays, uv0Size).subarray(0, vertexCount * uv0Size),
      startVertex * uv0Size,
    );
    if (this.layout.uv1Size > 0) {
      const uv1Size = this.layout.uv1Size;
      const uv1Source = uv1Size === 3 ? arrays.vectorUvs : arrays.uv1s;
      this.uv1s.set(
        uv1Source.subarray(0, vertexCount * uv1Size),
        startVertex * uv1Size,
      );
    }

    for (let i = 0; i < indexCount; i += 1) {
      this.indices[startIndex + i] = arrays.indices[i] + startVertex;
    }

    this.vertexCount = startVertex + vertexCount;
    this.indexCount = startIndex + indexCount;

    const subset: BatchSubset = {
      strokeGuid,
      startVertex,
      vertexCount,
      startIndex,
      indexCount,
      active: true,
      bounds: boundsFromArrays(arrays),
    };
    this.subsets.push(subset);
    this.vertexDataDirty = true;
    this.topologyDirty = true;
    return subset;
  }

  /**
   * Hides a stroke by zeroing its indices, keeping a backup so it can be
   * restored (`Batch.DisableSubset`). Vertices stay put, so only the index
   * buffer needs re-uploading — this is how Open Brush makes selection and
   * layer toggles cheap.
   */
  disableSubset(subset: BatchSubset): void {
    if (!subset.active) {
      return;
    }
    subset.active = false;
    if (!subset.indexBackup) {
      subset.indexBackup = new Uint32Array(subset.indexCount);
    }
    const end = subset.startIndex + subset.indexCount;
    for (let i = subset.startIndex; i < end; i += 1) {
      subset.indexBackup[i - subset.startIndex] = this.indices[i];
      this.indices[i] = 0;
    }
    this.topologyDirty = true;
  }

  /** Restores a hidden stroke's indices (`Batch.EnableSubset`). */
  enableSubset(subset: BatchSubset): void {
    if (subset.active) {
      return;
    }
    subset.active = true;
    const backup = subset.indexBackup;
    if (!backup) {
      return;
    }
    const end = subset.startIndex + subset.indexCount;
    for (let i = subset.startIndex; i < end; i += 1) {
      this.indices[i] = backup[i - subset.startIndex];
    }
    this.topologyDirty = true;
  }

  /** Translates one subset in canvas space and updates its aggregate bounds. */
  translateSubset(
    subset: BatchSubset,
    delta: readonly [number, number, number],
  ): boolean {
    if (!this.subsets.includes(subset)) {
      return false;
    }
    const [dx, dy, dz] = delta;
    if (dx === 0 && dy === 0 && dz === 0) {
      return true;
    }
    const endVertex = subset.startVertex + subset.vertexCount;
    for (let vertex = subset.startVertex; vertex < endVertex; vertex += 1) {
      const offset = vertex * 3;
      this.positions[offset] += dx;
      this.positions[offset + 1] += dy;
      this.positions[offset + 2] += dz;
    }
    if (Number.isFinite(subset.bounds.min[0])) {
      subset.bounds.min[0] += dx;
      subset.bounds.min[1] += dy;
      subset.bounds.min[2] += dz;
      subset.bounds.max[0] += dx;
      subset.bounds.max[1] += dy;
      subset.bounds.max[2] += dz;
    }
    this.vertexDataDirty = true;
    return true;
  }

  /**
   * Removes a stroke (`Batch.RemoveSubset`). Its triangles are always
   * disabled; storage is reclaimed only when the subset is the tail, since
   * compacting the middle would invalidate every later subset's range. Dead
   * space in the middle is reclaimed once the subsets after it are removed.
   */
  removeSubset(subset: BatchSubset): boolean {
    const index = this.subsets.lastIndexOf(subset);
    if (index < 0) {
      return false;
    }
    this.disableSubset(subset);

    if (index === this.subsets.length - 1) {
      if (index > 0) {
        const previous = this.subsets[index - 1];
        this.vertexCount = previous.startVertex + previous.vertexCount;
        this.indexCount = previous.startIndex + previous.indexCount;
      } else {
        this.vertexCount = 0;
        this.indexCount = 0;
      }
      this.vertexDataDirty = true;
    }

    this.subsets.splice(index, 1);
    this.topologyDirty = true;
    return true;
  }

  /** Clears both dirty flags; called after the renderer uploads the arrays. */
  clearDirtyFlags(): void {
    this.vertexDataDirty = false;
    this.topologyDirty = false;
  }

  private ensureVertexCapacity(vertexCount: number): void {
    this.positions = growFloat32(this.positions, vertexCount * 3);
    this.normals = growFloat32(this.normals, vertexCount * 3);
    this.tangents = growFloat32(this.tangents, vertexCount * 4);
    this.colors = growFloat32(this.colors, vertexCount * 4);
    this.baseUvs = growFloat32(this.baseUvs, vertexCount * 2);
    this.uvs = growFloat32(this.uvs, vertexCount * this.layout.uv0Size);
    if (this.layout.uv1Size > 0) {
      this.uv1s = growFloat32(this.uv1s, vertexCount * this.layout.uv1Size);
    }
  }

  private ensureIndexCapacity(indexCount: number): void {
    this.indices = growUint32(this.indices, indexCount);
  }
}

/** Picks the source UV array matching the batch's texcoord0 width. */
function selectUvSource(
  arrays: BrushGeometryArrays,
  uv0Size: 2 | 3 | 4,
): Float32Array {
  if (uv0Size === 2) {
    return arrays.uvs;
  }
  if (uv0Size === 3) {
    return arrays.packedUvs;
  }
  return arrays.particleUvs;
}

function boundsFromArrays(arrays: BrushGeometryArrays): SubsetBounds {
  const bounds = createEmptyBounds();
  const { min, max } = arrays.bounds;
  if (
    Number.isFinite(min[0]) &&
    Number.isFinite(min[1]) &&
    Number.isFinite(min[2]) &&
    Number.isFinite(max[0]) &&
    Number.isFinite(max[1]) &&
    Number.isFinite(max[2])
  ) {
    bounds.min = [min[0]!, min[1]!, min[2]!];
    bounds.max = [max[0]!, max[1]!, max[2]!];
  }
  return bounds;
}

/** Reads the layout a stroke's generated geometry requires. */
export function layoutFromArrays(
  arrays: BrushGeometryArrays,
): BatchVertexLayout {
  return { uv0Size: arrays.uv0Size, uv1Size: arrays.uv1Size };
}

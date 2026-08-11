/**
 * Stroke batch pools — the port of Open Brush's `BatchPool` and `BatchManager`.
 *
 * `BatchManager` owns one pool per brush (keyed by brush GUID in Open Brush;
 * by the richer key `planBrushBatches` already computes here, since this port
 * also splits on layer and shader variant). Each pool holds an ordered list of
 * `StrokeBatch` meshes, appending to the last one until it fills and then
 * creating another. A stroke's location is remembered as
 * (batch, subset), which is all the eraser, selection, and layer toggles need
 * to hide, show, or delete it.
 */

import {
  StrokeBatch,
  layoutFromArrays,
  type BatchSubset,
  type BatchVertexLayout,
} from "./stroke-batch.js";
import {
  stringifyBatchKey,
  type BrushBatchKey,
} from "./brush-batching.js";
import type { BrushGeometryArrays } from "./brush-geometry.js";

/** Where a stroke lives: which batch, and which slice of it. */
export interface StrokeBatchLocation {
  key: BrushBatchKey;
  batch: StrokeBatch;
  subset: BatchSubset;
}

/**
 * All batches sharing one batch key (`BatchPool`).
 *
 * Open Brush keys pools by brush GUID alone. This port keys by the full
 * `BrushBatchKey` — layer, brush, geometry/material family, transparency, and
 * shader variant — because those already determine which strokes can share a
 * material here, and because layer visibility is a per-batch toggle.
 */
export class StrokeBatchPool {
  readonly key: BrushBatchKey;
  readonly batches: StrokeBatch[] = [];

  constructor(key: BrushBatchKey) {
    this.key = key;
  }

  /**
   * Returns a batch with room for `vertexCount` more vertices and a matching
   * attribute layout, creating one if needed (`BatchManager.GetBatch`).
   */
  acquireBatch(
    vertexCount: number,
    layout: BatchVertexLayout,
  ): StrokeBatch {
    const last = this.batches[this.batches.length - 1];
    if (last && last.acceptsLayout(layout) && last.hasSpaceFor(vertexCount)) {
      return last;
    }
    const batch = new StrokeBatch(layout);
    this.batches.push(batch);
    return batch;
  }

  /**
   * Drops batches that hold no strokes (`BatchPool.TrimBatches`). The last
   * batch is kept even when empty, so a steady draw-erase-draw cycle does not
   * thrash mesh creation. Returns the removed batches so the caller can
   * dispose their GPU resources.
   */
  trimBatches(): StrokeBatch[] {
    const removed: StrokeBatch[] = [];
    for (let index = 0; index < this.batches.length - 1; index += 1) {
      const batch = this.batches[index];
      if (batch.subsets.length > 0) {
        continue;
      }
      this.batches.splice(index, 1);
      index -= 1;
      removed.push(batch);
    }
    return removed;
  }
}

/**
 * Routes strokes into pooled batches (`BatchManager`).
 *
 * The lookup from stroke GUID to its (batch, subset) is held here so callers
 * can hide, show, or remove a stroke without scanning every batch — the
 * equivalent of Open Brush's `Stroke.m_BatchSubset` back-reference.
 */
export class StrokeBatchManager {
  private readonly pools = new Map<string, StrokeBatchPool>();
  private readonly locations = new Map<string, StrokeBatchLocation>();

  /** Every pool, in insertion order. */
  getPools(): StrokeBatchPool[] {
    return Array.from(this.pools.values());
  }

  /** Total batch (draw call) count across all pools. */
  countBatches(): number {
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.batches.length;
    }
    return total;
  }

  /** The batch and subset holding a stroke, if it is batched. */
  getLocation(strokeGuid: string): StrokeBatchLocation | undefined {
    return this.locations.get(strokeGuid);
  }

  /**
   * Commits a finished stroke's geometry into a batch and returns where it
   * landed (`BatchManager.CreateSubset`). Committing a stroke that is already
   * batched replaces its existing subset, so re-committing after an edit does
   * not leave a duplicate behind.
   */
  addStroke(
    strokeGuid: string,
    key: BrushBatchKey,
    arrays: BrushGeometryArrays,
  ): StrokeBatchLocation {
    const existing = this.locations.get(strokeGuid);
    if (existing) {
      this.removeStroke(strokeGuid);
    }

    const keyString = stringifyBatchKey(key);
    let pool = this.pools.get(keyString);
    if (!pool) {
      pool = new StrokeBatchPool(key);
      this.pools.set(keyString, pool);
    }

    const layout = layoutFromArrays(arrays);
    const batch = pool.acquireBatch(arrays.vertexCount, layout);
    const subset = batch.addSubset(strokeGuid, arrays);
    const location: StrokeBatchLocation = { key, batch, subset };
    this.locations.set(strokeGuid, location);
    return location;
  }

  /** Removes a stroke from its batch. Returns false if it was not batched. */
  removeStroke(strokeGuid: string): boolean {
    const location = this.locations.get(strokeGuid);
    if (!location) {
      return false;
    }
    location.batch.removeSubset(location.subset);
    this.locations.delete(strokeGuid);
    return true;
  }

  /**
   * Shows or hides a stroke without moving its vertices — used by the eraser's
   * preview, selection, and layer visibility.
   */
  setStrokeVisible(strokeGuid: string, visible: boolean): boolean {
    const location = this.locations.get(strokeGuid);
    if (!location) {
      return false;
    }
    if (visible) {
      location.batch.enableSubset(location.subset);
    } else {
      location.batch.disableSubset(location.subset);
    }
    return true;
  }

  /**
   * Drops empty batches across all pools (`BatchManager.Update`). Returns the
   * removed batches so the caller can dispose their GPU resources.
   */
  trim(): StrokeBatch[] {
    const removed: StrokeBatch[] = [];
    for (const [keyString, pool] of this.pools) {
      removed.push(...pool.trimBatches());
      const onlyBatch = pool.batches.length === 1 ? pool.batches[0] : undefined;
      if (pool.batches.length === 0) {
        this.pools.delete(keyString);
      } else if (onlyBatch && onlyBatch.subsets.length === 0) {
        // A pool whose sole batch is empty holds nothing; drop it too, so an
        // erased layer does not leave dead pools behind.
        this.pools.delete(keyString);
        removed.push(onlyBatch);
      }
    }
    return removed;
  }

  /** Forgets every pool and stroke location. */
  clear(): StrokeBatch[] {
    const removed: StrokeBatch[] = [];
    for (const pool of this.pools.values()) {
      removed.push(...pool.batches);
    }
    this.pools.clear();
    this.locations.clear();
    return removed;
  }
}

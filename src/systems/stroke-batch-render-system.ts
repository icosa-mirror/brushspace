import {
  BufferGeometry,
  Mesh,
  createSystem,
  type Entity,
  type Material,
} from "@iwsdk/core";

import {
  BatchedBrushStroke,
  BrushStroke,
  OpenBrushScenePose,
  StrokeBatchMesh,
} from "../components/core.js";
import { createBatchKey, stringifyBatchKey } from "../brushes/brush-batching.js";
import { resolveBrushBatchRuntimeEligibility } from "../brushes/brush-batch-compatibility.js";
import { findBrushByGuid } from "../brushes/brush-inventory.js";
import { openBrushInventory } from "../brushes/brush-catalog.js";
import type { BrushGeometryArrays } from "../brushes/brush-geometry.js";
import { uploadStrokeBatchGeometry } from "../brushes/stroke-batch-geometry.js";
import {
  FLAT_BATCH_BRUSH_GUID,
  isStrokeBatchingEnabled,
} from "../brushes/stroke-batch-feature.js";
import { StrokeBatchManager } from "../brushes/stroke-batch-manager.js";
import type { StrokeBatch } from "../brushes/stroke-batch.js";
import { createBrushRenderMaterial } from "../brushes/brush-render-material.js";
import { openBrushShaderLibrary } from "../brushes/brush-shader-library.js";
import type { StrokeData } from "../types.js";

const LOG_PREFIX = "[StrokeBatchRender]";

interface BatchRenderTarget {
  id: number;
  entity: Entity;
  geometry: BufferGeometry;
  material: Material | Material[];
}

export interface StrokeBatchRendererMetrics {
  enabled: boolean;
  activeBatchCount: number;
  compatibleStrokeCount: number;
  fallbackStrokeCount: number;
  uploadedBytes: number;
  rendererCalls: number;
  rendererTriangles: number;
}

/**
 * Owns shared batch meshes and the transition from private finalized meshes.
 * The initial vertical slice is intentionally limited to Flat; incompatible
 * and not-yet-loaded materials remain on the existing per-stroke renderer.
 */
export class StrokeBatchRenderSystem extends createSystem({
  strokes: { required: [BrushStroke] },
  batchedStrokes: { required: [BrushStroke, BatchedBrushStroke] },
  scenePoses: { required: [OpenBrushScenePose] },
}) {
  private readonly manager = new StrokeBatchManager();
  private readonly targets = new Map<StrokeBatch, BatchRenderTarget>();
  private readonly pending = new Map<string, BrushGeometryArrays>();
  private readonly pendingGuidByEntityIndex = new Map<number, string>();
  private readonly strokeGuidByEntityIndex = new Map<number, string>();
  private enabled = false;
  private nextBatchId = 1;
  private metricsClock = 0;
  private readonly metrics: StrokeBatchRendererMetrics = {
    enabled: false,
    activeBatchCount: 0,
    compatibleStrokeCount: 0,
    fallbackStrokeCount: 0,
    uploadedBytes: 0,
    rendererCalls: 0,
    rendererTriangles: 0,
  };

  init(): void {
    this.enabled =
      typeof window !== "undefined" &&
      isStrokeBatchingEnabled(window.location.search);
    this.metrics.enabled = this.enabled;
    this.publishMetrics();
    if (!this.enabled) {
      return;
    }

    console.log(`${LOG_PREFIX} enabled for finalized Flat strokes.`);
    this.cleanupFuncs.push(
      openBrushShaderLibrary.subscribeMaterialLoaded((guid) => {
        if (guid.toLowerCase() === FLAT_BATCH_BRUSH_GUID) {
          this.commitPendingStrokes();
        }
      }),
    );
    this.queries.batchedStrokes.subscribe("disqualify", (entity) => {
      const guid = this.strokeGuidByEntityIndex.get(entity.index);
      if (!guid) {
        return;
      }
      this.strokeGuidByEntityIndex.delete(entity.index);
      this.pending.delete(guid);
      this.manager.removeStroke(guid);
      this.trimAndFlush();
      this.refreshBatchMetrics();
    });
    this.queries.strokes.subscribe("disqualify", (entity) => {
      const guid = this.pendingGuidByEntityIndex.get(entity.index);
      if (!guid) {
        return;
      }
      this.pendingGuidByEntityIndex.delete(entity.index);
      this.pending.delete(guid);
    });
    this.cleanupFuncs.push(() => this.disposeAll());
  }

  update(delta: number): void {
    if (!this.enabled) {
      return;
    }
    this.metricsClock += delta;
    if (this.metricsClock < 1) {
      return;
    }
    this.metricsClock = 0;
    this.metrics.rendererCalls = this.renderer.info.render.calls;
    this.metrics.rendererTriangles = this.renderer.info.render.triangles;
    this.refreshBatchMetrics();
  }

  /** Commit finalized generated arrays; returns false while using fallback. */
  commitStroke(entity: Entity, arrays: BrushGeometryArrays): boolean {
    if (
      !this.enabled ||
      !entity.hasComponent(BrushStroke) ||
      !entity.getValue(BrushStroke, "finalized")
    ) {
      return false;
    }
    const brushGuid = String(entity.getValue(BrushStroke, "brushGuid"));
    if (brushGuid.toLowerCase() !== FLAT_BATCH_BRUSH_GUID) {
      return false;
    }
    const guid = String(entity.getValue(BrushStroke, "guid"));
    const entry = findBrushByGuid(openBrushInventory, brushGuid);
    const loadedMaterial = entry
      ? openBrushShaderLibrary.get(entry.guid)
      : undefined;
    const eligibility = resolveBrushBatchRuntimeEligibility(
      entry,
      Boolean(loadedMaterial),
    );
    if (!eligibility.eligible || !entry || !loadedMaterial) {
      this.pending.set(guid, arrays);
      this.pendingGuidByEntityIndex.set(entity.index, guid);
      return false;
    }

    const strokeData = entity.object3D?.userData.openBrushStrokeData as
      | StrokeData
      | undefined;
    if (!strokeData) {
      return false;
    }
    this.pending.delete(guid);
    this.pendingGuidByEntityIndex.delete(entity.index);
    const key = createBatchKey(strokeData, entry);
    const location = this.manager.addStroke(guid, key, arrays);
    const target = this.ensureTarget(location.batch, loadedMaterial, key);
    this.trimAndFlush();

    this.strokeGuidByEntityIndex.set(entity.index, guid);
    if (!entity.hasComponent(BatchedBrushStroke)) {
      entity.addComponent(BatchedBrushStroke, { batchId: target.id });
    } else {
      entity.setValue(BatchedBrushStroke, "batchId", target.id);
    }
    if (entity.object3D) {
      entity.object3D.visible = false;
    }
    this.refreshBatchMetrics();
    return true;
  }

  setStrokeVisible(strokeGuid: string, visible: boolean): boolean {
    if (!this.manager.setStrokeVisible(strokeGuid, visible)) {
      return false;
    }
    this.flushDirtyBatches();
    return true;
  }

  removeStroke(strokeGuid: string): boolean {
    this.pending.delete(strokeGuid);
    for (const [entityIndex, guid] of this.pendingGuidByEntityIndex) {
      if (guid === strokeGuid) {
        this.pendingGuidByEntityIndex.delete(entityIndex);
        break;
      }
    }
    if (!this.manager.removeStroke(strokeGuid)) {
      return false;
    }
    this.trimAndFlush();
    this.refreshBatchMetrics();
    return true;
  }

  getMetrics(): Readonly<StrokeBatchRendererMetrics> {
    return this.metrics;
  }

  private commitPendingStrokes(): void {
    for (const [guid, arrays] of this.pending) {
      const entity = this.findStrokeEntity(guid);
      if (!entity) {
        this.pending.delete(guid);
        for (const [entityIndex, pendingGuid] of this.pendingGuidByEntityIndex) {
          if (pendingGuid === guid) {
            this.pendingGuidByEntityIndex.delete(entityIndex);
            break;
          }
        }
        continue;
      }
      this.commitStroke(entity, arrays);
    }
  }

  private findStrokeEntity(guid: string): Entity | undefined {
    for (const entity of this.queries.strokes.entities) {
      if (String(entity.getValue(BrushStroke, "guid")) === guid) {
        return entity;
      }
    }
    return undefined;
  }

  private ensureTarget(
    batch: StrokeBatch,
    loadedMaterial: Material,
    key: ReturnType<typeof createBatchKey>,
  ): BatchRenderTarget {
    const existing = this.targets.get(batch);
    if (existing) {
      return existing;
    }
    const material = createBrushRenderMaterial(
      key.brushGuid,
      loadedMaterial,
      openBrushShaderLibrary.frameUniforms,
    );
    const geometry = new BufferGeometry();
    const mesh = new Mesh(geometry, material);
    const id = this.nextBatchId;
    this.nextBatchId += 1;
    mesh.name = `OpenBrushStrokeBatchMesh_${id}`;
    const pose = this.getScenePose();
    const entity = pose
      ? this.world.createTransformEntity(mesh, pose)
      : this.world.createTransformEntity(mesh);
    entity.object3D!.name = `OpenBrushStrokeBatch_${id}`;
    entity.addComponent(StrokeBatchMesh, {
      batchId: id,
      brushGuid: key.brushGuid,
      layerIndex: key.layerIndex,
      key: stringifyBatchKey(key),
    });
    const target = { id, entity, geometry, material };
    this.targets.set(batch, target);
    return target;
  }

  private getScenePose(): Entity | undefined {
    const next = this.queries.scenePoses.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private trimAndFlush(): void {
    for (const removed of this.manager.trim()) {
      this.disposeTarget(removed);
    }
    this.flushDirtyBatches();
  }

  private flushDirtyBatches(): void {
    for (const pool of this.manager.getPools()) {
      for (const batch of pool.batches) {
        if (!batch.vertexDataDirty && !batch.topologyDirty) {
          continue;
        }
        const target = this.targets.get(batch);
        if (!target) {
          continue;
        }
        const result = uploadStrokeBatchGeometry(
          target.geometry,
          batch,
          pool.key.brushGuid,
          target.material,
        );
        this.metrics.uploadedBytes += result.uploadedBytes;
      }
    }
  }

  private disposeTarget(batch: StrokeBatch): void {
    const target = this.targets.get(batch);
    if (!target) {
      return;
    }
    target.geometry.dispose();
    // The shader material is shared and owned by BrushShaderLibrary.
    target.entity.destroy();
    this.targets.delete(batch);
  }

  private disposeAll(): void {
    for (const batch of this.manager.clear()) {
      this.disposeTarget(batch);
    }
    this.pending.clear();
    this.pendingGuidByEntityIndex.clear();
    this.strokeGuidByEntityIndex.clear();
  }

  private refreshBatchMetrics(): void {
    this.metrics.activeBatchCount = this.manager.countBatches();
    this.metrics.compatibleStrokeCount = this.manager.countStrokes();
    let finalized = 0;
    for (const entity of this.queries.strokes.entities) {
      if (entity.getValue(BrushStroke, "finalized")) {
        finalized += 1;
      }
    }
    this.metrics.fallbackStrokeCount = Math.max(
      0,
      finalized - this.metrics.compatibleStrokeCount,
    );
    this.publishMetrics();
  }

  private publishMetrics(): void {
    if (typeof document === "undefined") {
      return;
    }
    const dataset = document.documentElement.dataset;
    dataset.strokeBatches = this.metrics.enabled ? "enabled" : "disabled";
    dataset.strokeBatchCount = String(this.metrics.activeBatchCount);
    dataset.strokeBatchCompatibleStrokes = String(
      this.metrics.compatibleStrokeCount,
    );
    dataset.strokeBatchFallbackStrokes = String(this.metrics.fallbackStrokeCount);
    dataset.strokeBatchUploadBytes = String(this.metrics.uploadedBytes);
    dataset.strokeBatchRendererCalls = String(this.metrics.rendererCalls);
    dataset.strokeBatchRendererTriangles = String(this.metrics.rendererTriangles);
  }
}

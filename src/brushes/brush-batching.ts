import {
  findBrushByGuid,
  type BrushGeometryFamily,
  type BrushInventoryEntry,
  type BrushMaterialFamily,
} from "./brush-inventory.js";
import type { StrokeData } from "../types.js";
import {
  auditBrushBatchCompatibility,
  type BrushBatchMaterialMode,
  type BrushBatchRenderPassContract,
  type BrushBatchSupplementalAttributeContract,
} from "./brush-batch-compatibility.js";
import { createBrushMaterialSpec } from "./brush-materials.js";

export interface StrokeBatchInput {
  stroke: StrokeData;
  vertexCount: number;
  indexCount: number;
  visible?: boolean;
}

export interface BrushBatchKey {
  layerIndex: number;
  brushGuid: string;
  geometryFamily: BrushGeometryFamily;
  materialFamily: BrushMaterialFamily;
  transparent: boolean;
  materialMode: BrushBatchMaterialMode;
  renderPassContract: BrushBatchRenderPassContract;
  supplementalAttributeContract: BrushBatchSupplementalAttributeContract;
  /** Shared brush material identity, or a unique per-stroke fallback key. */
  materialInstanceKey: string;
}

export interface BrushBatchPlan {
  key: BrushBatchKey;
  strokeGuids: string[];
  visibleStrokeCount: number;
  vertexCount: number;
  indexCount: number;
  batchable: boolean;
  warning?: string;
}

export function planBrushBatches(
  strokes: readonly StrokeBatchInput[],
  inventory: readonly BrushInventoryEntry[],
): BrushBatchPlan[] {
  const batches = new Map<string, BrushBatchPlan>();
  for (const input of strokes) {
    const entry = findBrushByGuid(inventory, input.stroke.brushGuid);
    const compatibility = auditBrushBatchCompatibility(entry);
    const key = createBatchKey(input.stroke, entry);
    const keyString = stringifyBatchKey(key);
    let batch = batches.get(keyString);
    if (!batch) {
      batch = {
        key,
        strokeGuids: [],
        visibleStrokeCount: 0,
        vertexCount: 0,
        indexCount: 0,
        batchable: compatibility.batchableWithManagedMaterial,
        warning: compatibility.reason,
      };
      batches.set(keyString, batch);
    }

    batch.strokeGuids.push(input.stroke.guid);
    if (input.visible ?? true) {
      batch.visibleStrokeCount += 1;
    }
    batch.vertexCount += input.vertexCount;
    batch.indexCount += input.indexCount;
  }

  return Array.from(batches.values()).sort(compareBatchPlans);
}

export function stringifyBatchKey(key: BrushBatchKey): string {
  return [
    key.layerIndex,
    key.brushGuid,
    key.geometryFamily,
    key.materialFamily,
    key.transparent ? "transparent" : "opaque",
    key.materialMode,
    key.renderPassContract,
    key.supplementalAttributeContract,
    key.materialInstanceKey,
  ].join("|");
}

export function createBatchKey(
  stroke: StrokeData,
  entry: BrushInventoryEntry | undefined,
): BrushBatchKey {
  const geometryFamily = entry?.geometryFamily ?? "unsupported";
  const materialFamily = entry?.materialFamily ?? "fallback";
  const compatibility = auditBrushBatchCompatibility(entry);
  const materialSpec = createBrushMaterialSpec(entry, stroke.color);
  const materialMode: BrushBatchMaterialMode =
    compatibility.batchableWithManagedMaterial
      ? "managed-shader"
      : "per-stroke-fallback";
  const brushGuid = entry?.guid ?? stroke.brushGuid;
  return {
    layerIndex: stroke.layerIndex,
    brushGuid,
    geometryFamily,
    materialFamily,
    transparent: compatibility.transparent ?? materialSpec.transparent,
    materialMode,
    renderPassContract: compatibility.renderPassContract,
    supplementalAttributeContract:
      compatibility.supplementalAttributeContract,
    materialInstanceKey:
      materialMode === "managed-shader" ? brushGuid : stroke.guid,
  };
}

function compareBatchPlans(a: BrushBatchPlan, b: BrushBatchPlan): number {
  return stringifyBatchKey(a.key).localeCompare(stringifyBatchKey(b.key));
}

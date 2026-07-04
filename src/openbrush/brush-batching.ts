import {
  findBrushByGuid,
  type BrushGeometryFamily,
  type BrushInventoryEntry,
  type BrushMaterialFamily,
} from "./brush-inventory.js";
import type { StrokeData } from "./types.js";

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
  shaderVariant: string;
}

export interface BrushBatchPlan {
  key: BrushBatchKey;
  strokeGuids: string[];
  visibleStrokeCount: number;
  vertexCount: number;
  indexCount: number;
  warning?: string;
}

export function planBrushBatches(
  strokes: readonly StrokeBatchInput[],
  inventory: readonly BrushInventoryEntry[],
): BrushBatchPlan[] {
  const batches = new Map<string, BrushBatchPlan>();
  for (const input of strokes) {
    const entry = findBrushByGuid(inventory, input.stroke.brushGuid);
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
        warning: getBatchWarning(entry),
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

function getBatchWarning(
  entry: BrushInventoryEntry | undefined,
): string | undefined {
  if (!entry) {
    return "Brush has not been mapped to an IWSDK geometry/material family yet.";
  }
  if (entry.supportStatus !== "unsupported") {
    return undefined;
  }
  return entry.unsupportedReason ?? "Unsupported brush uses fallback batch.";
}

export function stringifyBatchKey(key: BrushBatchKey): string {
  return [
    key.layerIndex,
    key.brushGuid,
    key.geometryFamily,
    key.materialFamily,
    key.transparent ? "transparent" : "opaque",
    key.shaderVariant,
  ].join("|");
}

function createBatchKey(
  stroke: StrokeData,
  entry: BrushInventoryEntry | undefined,
): BrushBatchKey {
  const geometryFamily = entry?.geometryFamily ?? "unsupported";
  const materialFamily = entry?.materialFamily ?? "fallback";
  return {
    layerIndex: stroke.layerIndex,
    brushGuid: stroke.brushGuid,
    geometryFamily,
    materialFamily,
    transparent:
      stroke.color[3] < 1 ||
      materialFamily === "additive" ||
      materialFamily === "particle",
    shaderVariant: `${geometryFamily}:${materialFamily}`,
  };
}

function compareBatchPlans(a: BrushBatchPlan, b: BrushBatchPlan): number {
  return stringifyBatchKey(a.key).localeCompare(stringifyBatchKey(b.key));
}

export interface OpenBrushPerformanceInput {
  layerCount: number;
  visibleStrokeCount: number;
  finalizedStrokeCount: number;
  vertexCount: number;
  indexCount: number;
  materialVariantCount: number;
}

export interface OpenBrushPerformanceCounters {
  drawCallCount: number;
  batchCount: number;
  visibleStrokeCount: number;
  finalizedStrokeCount: number;
  vertexCount: number;
  indexCount: number;
  bufferUploadBytes: number;
  memoryEstimateBytes: number;
  materialVariantCount: number;
  warning: string;
}

export const OPEN_BRUSH_PERFORMANCE_LIMITS = {
  drawCallWarning: 500,
  vertexWarning: 250_000,
  memoryWarningBytes: 128 * 1024 * 1024,
} as const;

const BYTES_PER_VERTEX =
  3 * Float32Array.BYTES_PER_ELEMENT +
  3 * Float32Array.BYTES_PER_ELEMENT +
  4 * Float32Array.BYTES_PER_ELEMENT +
  2 * Float32Array.BYTES_PER_ELEMENT;
const BYTES_PER_INDEX = Uint32Array.BYTES_PER_ELEMENT;
const ESTIMATED_STROKE_OVERHEAD_BYTES = 512;
const ESTIMATED_LAYER_OVERHEAD_BYTES = 256;
const ESTIMATED_MATERIAL_OVERHEAD_BYTES = 4096;

export function estimateOpenBrushPerformanceCounters(
  input: OpenBrushPerformanceInput,
): OpenBrushPerformanceCounters {
  const layerCount = normalizeCount(input.layerCount);
  const visibleStrokeCount = normalizeCount(input.visibleStrokeCount);
  const finalizedStrokeCount = normalizeCount(input.finalizedStrokeCount);
  const vertexCount = normalizeCount(input.vertexCount);
  const indexCount = normalizeCount(input.indexCount);
  const materialVariantCount = normalizeCount(input.materialVariantCount);
  const batchCount =
    visibleStrokeCount === 0
      ? 0
      : Math.max(1, Math.min(visibleStrokeCount, layerCount * materialVariantCount));
  const bufferUploadBytes =
    vertexCount * BYTES_PER_VERTEX + indexCount * BYTES_PER_INDEX;
  const memoryEstimateBytes =
    bufferUploadBytes +
    finalizedStrokeCount * ESTIMATED_STROKE_OVERHEAD_BYTES +
    layerCount * ESTIMATED_LAYER_OVERHEAD_BYTES +
    materialVariantCount * ESTIMATED_MATERIAL_OVERHEAD_BYTES;

  return {
    drawCallCount: visibleStrokeCount,
    batchCount,
    visibleStrokeCount,
    finalizedStrokeCount,
    vertexCount,
    indexCount,
    bufferUploadBytes,
    memoryEstimateBytes,
    materialVariantCount,
    warning: getPerformanceWarning({
      drawCallCount: visibleStrokeCount,
      vertexCount,
      memoryEstimateBytes,
    }),
  };
}

function getPerformanceWarning({
  drawCallCount,
  vertexCount,
  memoryEstimateBytes,
}: {
  drawCallCount: number;
  vertexCount: number;
  memoryEstimateBytes: number;
}): string {
  if (memoryEstimateBytes >= OPEN_BRUSH_PERFORMANCE_LIMITS.memoryWarningBytes) {
    return "memory-budget";
  }
  if (vertexCount >= OPEN_BRUSH_PERFORMANCE_LIMITS.vertexWarning) {
    return "vertex-budget";
  }
  if (drawCallCount >= OPEN_BRUSH_PERFORMANCE_LIMITS.drawCallWarning) {
    return "draw-call-budget";
  }
  return "";
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

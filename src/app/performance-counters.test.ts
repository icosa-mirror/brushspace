import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_PERFORMANCE_LIMITS,
  estimateOpenBrushPerformanceCounters,
} from "./performance-counters.js";

describe("Open Brush performance counters", () => {
  it("estimates draw calls, batches, upload bytes, and memory", () => {
    const counters = estimateOpenBrushPerformanceCounters({
      layerCount: 2,
      visibleStrokeCount: 5,
      finalizedStrokeCount: 6,
      vertexCount: 100,
      indexCount: 150,
      materialVariantCount: 3,
    });

    expect(counters.drawCallCount).toBe(5);
    expect(counters.batchCount).toBe(5);
    expect(counters.vertexCount).toBe(100);
    expect(counters.indexCount).toBe(150);
    expect(counters.bufferUploadBytes).toBeGreaterThan(0);
    expect(counters.memoryEstimateBytes).toBeGreaterThan(
      counters.bufferUploadBytes,
    );
    expect(counters.warning).toBe("");
  });

  it("normalizes invalid or negative counts", () => {
    const counters = estimateOpenBrushPerformanceCounters({
      layerCount: Number.NaN,
      visibleStrokeCount: -1,
      finalizedStrokeCount: -5,
      vertexCount: Number.POSITIVE_INFINITY,
      indexCount: -20,
      materialVariantCount: -2,
    });

    expect(counters).toMatchObject({
      drawCallCount: 0,
      batchCount: 0,
      visibleStrokeCount: 0,
      finalizedStrokeCount: 0,
      vertexCount: 0,
      indexCount: 0,
      materialVariantCount: 0,
      warning: "",
    });
  });

  it("reports the highest-risk performance warning", () => {
    expect(
      estimateOpenBrushPerformanceCounters({
        layerCount: 1,
        visibleStrokeCount: OPEN_BRUSH_PERFORMANCE_LIMITS.drawCallWarning,
        finalizedStrokeCount: 0,
        vertexCount: 0,
        indexCount: 0,
        materialVariantCount: 1,
      }).warning,
    ).toBe("draw-call-budget");

    expect(
      estimateOpenBrushPerformanceCounters({
        layerCount: 1,
        visibleStrokeCount: 1,
        finalizedStrokeCount: 0,
        vertexCount: OPEN_BRUSH_PERFORMANCE_LIMITS.vertexWarning,
        indexCount: 0,
        materialVariantCount: 1,
      }).warning,
    ).toBe("vertex-budget");

    expect(
      estimateOpenBrushPerformanceCounters({
        layerCount: 1,
        visibleStrokeCount: 1,
        finalizedStrokeCount: 0,
        vertexCount: OPEN_BRUSH_PERFORMANCE_LIMITS.vertexWarning * 20,
        indexCount: 0,
        materialVariantCount: 1,
      }).warning,
    ).toBe("memory-budget");
  });
});

import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE,
  OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE,
  OPEN_BRUSH_DEFAULT_SIZE01,
  OPEN_BRUSH_DEFAULT_STARTUP_BRUSH_SIZE_RANGE,
  OPEN_BRUSH_DEFAULT_STARTUP_LIVE_BRUSH_SIZE,
  brushSize01ToLiveBrushSize,
  brushSize01ToOpenBrushSize,
  liveBrushSizeToSize01,
  normalizeBrushSize,
  normalizeBrushSize01,
  normalizeBrushSizeRange,
  openBrushSizeToBrushSize01,
  resolveBrushSize01Adjustment,
} from "./brush-size.js";

describe("Open Brush brush size", () => {
  it("tracks normalized default separately from live absolute stroke size", () => {
    expect(OPEN_BRUSH_DEFAULT_SIZE01).toBe(0.5);
    expect(OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE).toBeCloseTo(0.02);
    expect(
      brushSize01ToLiveBrushSize(
        OPEN_BRUSH_DEFAULT_SIZE01,
        OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE,
      ),
    ).toBeCloseTo(OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE);
  });

  it("uses the upstream Light brush for startup and fallback live size", () => {
    expect(OPEN_BRUSH_DEFAULT_STARTUP_BRUSH_SIZE_RANGE).toEqual([0.05, 0.2]);
    expect(
      brushSize01ToOpenBrushSize(
        OPEN_BRUSH_DEFAULT_SIZE01,
        OPEN_BRUSH_DEFAULT_STARTUP_BRUSH_SIZE_RANGE,
      ),
    ).toBeCloseTo(0.1125);
    expect(OPEN_BRUSH_DEFAULT_STARTUP_LIVE_BRUSH_SIZE).toBeCloseTo(0.002353, 6);
    expect(
      brushSize01ToLiveBrushSize(
        OPEN_BRUSH_DEFAULT_SIZE01,
        OPEN_BRUSH_DEFAULT_STARTUP_BRUSH_SIZE_RANGE,
      ),
    ).toBeCloseTo(OPEN_BRUSH_DEFAULT_STARTUP_LIVE_BRUSH_SIZE);
  });

  it("rejects invalid live brush sizes", () => {
    expect(normalizeBrushSize(Number.NaN)).toBe(
      OPEN_BRUSH_DEFAULT_STARTUP_LIVE_BRUSH_SIZE,
    );
    expect(normalizeBrushSize(0)).toBe(
      OPEN_BRUSH_DEFAULT_STARTUP_LIVE_BRUSH_SIZE,
    );
    expect(normalizeBrushSize(0.025)).toBe(0.025);
  });

  it("clamps normalized brush size controls", () => {
    expect(normalizeBrushSize01(Number.NaN)).toBe(OPEN_BRUSH_DEFAULT_SIZE01);
    expect(normalizeBrushSize01(-1)).toBe(0);
    expect(normalizeBrushSize01(2)).toBe(1);
    expect(normalizeBrushSize01(0.25)).toBe(0.25);
  });

  it("normalizes invalid or reversed brush ranges", () => {
    expect(normalizeBrushSizeRange(undefined)).toEqual(
      OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE,
    );
    expect(normalizeBrushSizeRange([0, 2])).toEqual(
      OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE,
    );
    expect(normalizeBrushSizeRange([2, 0.25])).toEqual([0.25, 2]);
  });

  it("matches Open Brush sqrt-radius size interpolation", () => {
    expect(brushSize01ToOpenBrushSize(0, [0.05, 3])).toBeCloseTo(0.05);
    expect(brushSize01ToOpenBrushSize(1, [0.05, 3])).toBeCloseTo(3);
    expect(brushSize01ToOpenBrushSize(0.5, [0.05, 3])).toBeCloseTo(
      0.9561862178478972,
    );
    expect(openBrushSizeToBrushSize01(0.9561862178478972, [0.05, 3])).toBeCloseTo(
      0.5,
    );
  });

  it("round trips IWSDK live sizes through the active brush range", () => {
    const lightRange = [0.05, 0.2] as const;
    const liveSize = brushSize01ToLiveBrushSize(0.65, lightRange);

    expect(liveSize).toBeGreaterThan(0);
    expect(liveBrushSizeToSize01(liveSize, lightRange)).toBeCloseTo(0.65);
  });

  it("resolves normalized UI size nudges into live brush sizes", () => {
    const lightRange = [0.05, 0.2] as const;
    const increased = resolveBrushSize01Adjustment(0.5, 0.05, lightRange);
    const clampedLow = resolveBrushSize01Adjustment(0.01, -0.1, lightRange);
    const clampedHigh = resolveBrushSize01Adjustment(0.98, 0.1, lightRange);

    expect(increased.size01).toBeCloseTo(0.55);
    expect(increased.size).toBeCloseTo(
      brushSize01ToLiveBrushSize(0.55, lightRange),
    );
    expect(clampedLow.size01).toBe(0);
    expect(clampedHigh.size01).toBe(1);
  });
});

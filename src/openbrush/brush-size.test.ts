import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE,
  OPEN_BRUSH_DEFAULT_SIZE01,
  normalizeBrushSize,
} from "./brush-size.js";

describe("Open Brush brush size", () => {
  it("tracks normalized default separately from live absolute stroke size", () => {
    expect(OPEN_BRUSH_DEFAULT_SIZE01).toBe(0.5);
    expect(OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE).toBeLessThan(0.1);
  });

  it("rejects invalid live brush sizes", () => {
    expect(normalizeBrushSize(Number.NaN)).toBe(OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE);
    expect(normalizeBrushSize(0)).toBe(OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE);
    expect(normalizeBrushSize(0.025)).toBe(0.025);
  });
});

import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_DEFAULT_SIZE01,
  brushSize01ToLiveBrushSize,
} from "./brush-size.js";
import {
  OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  initialOpenBrushIndex,
  selectableOpenBrushes,
} from "./brush-catalog.js";

describe("Open Brush brush catalog", () => {
  it("starts on the upstream Light brush instead of the Marker fixture", () => {
    const defaultBrush = selectableOpenBrushes[initialOpenBrushIndex];

    expect(OPEN_BRUSH_DEFAULT_BRUSH_GUID).toBe(
      "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
    );
    expect(defaultBrush).toMatchObject({
      guid: OPEN_BRUSH_DEFAULT_BRUSH_GUID,
      name: "Light",
      brushSizeRange: [0.05, 0.2],
    });
    expect(
      brushSize01ToLiveBrushSize(
        OPEN_BRUSH_DEFAULT_SIZE01,
        defaultBrush.brushSizeRange,
      ),
    ).toBeCloseTo(0.002353, 6);
  });
});

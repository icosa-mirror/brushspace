import { describe, expect, it } from "vitest";

import {
  isOpenBrushEraserCursorVisible,
  writeOpenBrushEraserCursorLocalPosition,
} from "./eraser-cursor.js";
import type { Vec3 } from "./types.js";

describe("Open Brush eraser cursor", () => {
  it("is visible only while the eraser tool is active in XR", () => {
    expect(isOpenBrushEraserCursorVisible("eraser", "visible")).toBe(true);
    expect(isOpenBrushEraserCursorVisible("free-paint", "visible")).toBe(false);
    expect(isOpenBrushEraserCursorVisible("eraser", "non-immersive")).toBe(false);
  });

  it("uses the controller-forward eraser offset from the reference scene", () => {
    const target: Vec3 = [1, 2, 3];

    expect(writeOpenBrushEraserCursorLocalPosition(target)).toEqual([0, 0, -0.05]);
  });
});

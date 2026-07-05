import { describe, expect, it } from "vitest";

import { formatOpenBrushSizeMeters } from "./size-labels.js";

describe("Open Brush size labels", () => {
  it("keeps small brush sizes readable in millimeters", () => {
    expect(formatOpenBrushSizeMeters(0.002353189)).toBe("2.4 mm");
  });

  it("formats eraser-scale radii in meters", () => {
    expect(formatOpenBrushSizeMeters(0.2)).toBe("0.200 m");
  });

  it("handles invalid sizes without leaking NaN into UI", () => {
    expect(formatOpenBrushSizeMeters(Number.NaN)).toBe("0.0 mm");
  });
});

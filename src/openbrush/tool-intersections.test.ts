import { describe, expect, it } from "vitest";

import {
  strokeIntersectsEraser,
  type EraserStrokeCandidate,
} from "./tool-intersections.js";

const baseStroke: EraserStrokeCandidate = {
  layerIndex: 0,
  finalized: true,
  visible: true,
  renderVisible: true,
  brushSize: 0.04,
  minBounds: [-0.1, 1, -1],
  maxBounds: [0.1, 1, -1],
};

describe("tool intersections", () => {
  it("hits visible finalized strokes on the active layer", () => {
    expect(strokeIntersectsEraser(baseStroke, 0, [0, 1, -1], 0.03)).toBe(true);
  });

  it("inflates bounds by stroke radius and eraser radius", () => {
    expect(strokeIntersectsEraser(baseStroke, 0, [0.14, 1, -1], 0.03)).toBe(true);
    expect(strokeIntersectsEraser(baseStroke, 0, [0.16, 1, -1], 0.03)).toBe(false);
  });

  it("ignores hidden, unfinished, and inactive-layer strokes", () => {
    expect(
      strokeIntersectsEraser({ ...baseStroke, visible: false }, 0, [0, 1, -1], 1),
    ).toBe(false);
    expect(
      strokeIntersectsEraser({ ...baseStroke, finalized: false }, 0, [0, 1, -1], 1),
    ).toBe(false);
    expect(strokeIntersectsEraser(baseStroke, 1, [0, 1, -1], 1)).toBe(false);
  });
});

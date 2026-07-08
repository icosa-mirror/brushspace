import { describe, expect, it } from "vitest";

import {
  canToolAffectStroke,
  strokeIntersectsTool,
  strokeIntersectsEraser,
  type ToolStrokeIntersectionCandidate,
} from "./tool-intersections.js";

const baseStroke: ToolStrokeIntersectionCandidate = {
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

  it("does not double inflate bounds that already include brush width", () => {
    const geometryBoundStroke: ToolStrokeIntersectionCandidate = {
      ...baseStroke,
      boundsIncludeBrushWidth: true,
    };

    expect(strokeIntersectsEraser(geometryBoundStroke, 0, [0.13, 1, -1], 0.03)).toBe(
      true,
    );
    expect(
      strokeIntersectsEraser(geometryBoundStroke, 0, [0.14, 1, -1], 0.03),
    ).toBe(false);
  });

  it("shares the same visible finalized stroke filtering for picker tools", () => {
    expect(strokeIntersectsTool(baseStroke, 0, [0.1, 1, -1], 0.005)).toBe(true);
    expect(strokeIntersectsTool(baseStroke, 0, [0.13, 1, -1], 0.005)).toBe(false);
  });

  it("tests translated stroke bounds in world space", () => {
    const movedStroke: ToolStrokeIntersectionCandidate = {
      ...baseStroke,
      boundsOffset: [0.5, 0.25, -0.25],
    };

    expect(strokeIntersectsEraser(movedStroke, 0, [0.5, 1.25, -1.25], 0.03)).toBe(
      true,
    );
    expect(strokeIntersectsEraser(movedStroke, 0, [0, 1, -1], 0.03)).toBe(false);
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

  it("exposes layer and visibility gates separately from hit testing", () => {
    expect(canToolAffectStroke(baseStroke, 0)).toBe(true);
    expect(canToolAffectStroke({ ...baseStroke, renderVisible: false }, 0)).toBe(
      false,
    );
    expect(canToolAffectStroke(baseStroke, 1)).toBe(false);
  });
});

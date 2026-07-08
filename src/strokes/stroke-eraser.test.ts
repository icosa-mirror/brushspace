import { describe, expect, it } from "vitest";

import {
  collectOpenBrushEraserHits,
  isOpenBrushEraserHit,
  type OpenBrushEraserHitTarget,
} from "./stroke-eraser.js";
import type { ToolStrokeIntersectionCandidate } from "../tools/tool-intersections.js";

const baseStroke: ToolStrokeIntersectionCandidate = {
  layerIndex: 0,
  finalized: true,
  visible: true,
  renderVisible: true,
  brushSize: 0.04,
  minBounds: [-0.1, 1, -1],
  maxBounds: [0.1, 1, -1],
  boundsIncludeBrushWidth: true,
};

describe("stroke eraser", () => {
  it("collects only finalized visible strokes on the active layer", () => {
    const targets = [
      target("hit", baseStroke),
      target("inactive-layer", { ...baseStroke, layerIndex: 1 }),
      target("unfinished", { ...baseStroke, finalized: false }),
      target("hidden", { ...baseStroke, visible: false }),
      target("render-hidden", { ...baseStroke, renderVisible: false }),
      target("miss", {
        ...baseStroke,
        minBounds: [1, 1, -1],
        maxBounds: [1.1, 1, -1],
      }),
    ];

    expect(collectOpenBrushEraserHits(targets, 0, [0, 1, -1], 0.2)).toEqual([
      "hit",
    ]);
  });

  it("uses generated geometry results before bounds fallback", () => {
    expect(
      isOpenBrushEraserHit(
        target("aabb-hit-but-geometry-miss", baseStroke, false),
        0,
        [0, 1, -1],
        0.2,
      ),
    ).toBe(false);
    expect(
      isOpenBrushEraserHit(
        target(
          "aabb-miss-but-geometry-hit",
          {
            ...baseStroke,
            minBounds: [1, 1, -1],
            maxBounds: [1.1, 1, -1],
          },
          true,
        ),
        0,
        [0, 1, -1],
        0.2,
      ),
    ).toBe(true);
  });
});

function target(
  value: string,
  candidate: ToolStrokeIntersectionCandidate,
  geometryHit?: boolean,
): OpenBrushEraserHitTarget<string> {
  return { value, candidate, geometryHit };
}

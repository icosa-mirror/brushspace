import { describe, expect, it } from "vitest";

import {
  findNewestOpenBrushPickerHit,
  isOpenBrushPickerHit,
  type OpenBrushPickerHitTarget,
} from "./stroke-picker.js";
import type { ToolStrokeIntersectionCandidate } from "./tool-intersections.js";

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

describe("stroke picker", () => {
  it("uses generated geometry results before bounds fallback", () => {
    expect(
      isOpenBrushPickerHit(
        target("aabb-hit-but-geometry-miss", 1, baseStroke, false),
        0,
        [0, 1, -1],
        0.1,
      ),
    ).toBe(false);
    expect(
      isOpenBrushPickerHit(
        target(
          "aabb-miss-but-geometry-hit",
          1,
          {
            ...baseStroke,
            minBounds: [1, 1, -1],
            maxBounds: [1.1, 1, -1],
          },
          true,
        ),
        0,
        [0, 1, -1],
        0.1,
      ),
    ).toBe(true);
  });

  it("falls back to bounds when generated geometry is unavailable", () => {
    expect(
      isOpenBrushPickerHit(target("bounds-hit", 1, baseStroke), 0, [0, 1, -1], 0.1),
    ).toBe(true);
    expect(
      isOpenBrushPickerHit(
        target("bounds-miss", 1, {
          ...baseStroke,
          minBounds: [1, 1, -1],
          maxBounds: [1.1, 1, -1],
        }),
        0,
        [0, 1, -1],
        0.1,
      ),
    ).toBe(false);
  });

  it("selects the newest visible finalized stroke hit on the active layer", () => {
    const targets = [
      target("older", 1, baseStroke),
      target("newer-hidden", 3, { ...baseStroke, visible: false }, true),
      target("newer", 2, baseStroke),
      target("miss", 4, {
        ...baseStroke,
        minBounds: [1, 1, -1],
        maxBounds: [1.1, 1, -1],
      }),
    ];

    expect(findNewestOpenBrushPickerHit(targets, 0, [0, 1, -1], 0.1)).toBe(
      "newer",
    );
  });
});

function target(
  value: string,
  commandIndex: number,
  candidate: ToolStrokeIntersectionCandidate,
  geometryHit?: boolean,
): OpenBrushPickerHitTarget<string> {
  return { value, commandIndex, candidate, geometryHit };
}

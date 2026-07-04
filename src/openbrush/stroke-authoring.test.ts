import { describe, expect, it } from "vitest";

import {
  advanceStrokeAuthoringState,
  createStrokeAuthoringState,
  shouldSampleControlPoint,
  upsertStraightedgeEndpoint,
  type StrokePointerFrame,
} from "./stroke-authoring.js";
import type { ControlPoint } from "./types.js";

function frame(paintPressed: boolean, x: number): StrokePointerFrame {
  return {
    paintPressed,
    pressure: paintPressed ? 1 : 0,
    position: [x, 0, 0],
    orientation: [0, 0, 0, 1],
    timestampMs: x * 1000,
  };
}

describe("stroke authoring state", () => {
  it("starts exactly one stroke when paint becomes pressed", () => {
    const state = createStrokeAuthoringState();

    expect(advanceStrokeAuthoringState(state, frame(false, 0))).toBe("none");
    expect(advanceStrokeAuthoringState(state, frame(true, 0))).toBe("start");
    expect(advanceStrokeAuthoringState(state, frame(true, 0.1))).toBe("sample");

    expect(state.phase).toBe("drawing");
    expect(state.controlPointCount).toBe(2);
    expect(state.finalizedStrokeCount).toBe(0);
  });

  it("finalizes the active stroke when paint is released", () => {
    const state = createStrokeAuthoringState();

    advanceStrokeAuthoringState(state, frame(true, 0));
    advanceStrokeAuthoringState(state, frame(true, 0.1));

    expect(advanceStrokeAuthoringState(state, frame(false, 0.2))).toBe(
      "finalize",
    );
    expect(state.phase).toBe("idle");
    expect(state.finalizedStrokeCount).toBe(1);
  });

  it("uses squared distance to gate control point sampling", () => {
    expect(shouldSampleControlPoint([0, 0, 0], [0.01, 0, 0], 0.02)).toBe(
      false,
    );
    expect(shouldSampleControlPoint([0, 0, 0], [0.02, 0, 0], 0.02)).toBe(true);
    expect(shouldSampleControlPoint([0, 0, 0], [0.015, 0.015, 0], 0.02)).toBe(
      true,
    );
  });

  it("keeps straightedge strokes to a start point and moving endpoint", () => {
    const controlPoints: ControlPoint[] = [];

    expect(upsertStraightedgeEndpoint(controlPoints, frame(true, 0), 0.02)).toBe(
      "created",
    );
    expect(controlPoints).toHaveLength(1);
    expect(
      upsertStraightedgeEndpoint(controlPoints, frame(true, 0.01), 0.02),
    ).toBe("ignored");
    expect(controlPoints).toHaveLength(1);

    expect(upsertStraightedgeEndpoint(controlPoints, frame(true, 0.1), 0.02)).toBe(
      "created",
    );
    const endpoint = controlPoints[1];
    expect(endpoint.position).toEqual([0.1, 0, 0]);

    expect(upsertStraightedgeEndpoint(controlPoints, frame(true, 0.3), 0.02)).toBe(
      "updated",
    );
    expect(controlPoints).toHaveLength(2);
    expect(controlPoints[1]).toBe(endpoint);
    expect(controlPoints[1].position).toEqual([0.3, 0, 0]);
  });
});

import { describe, expect, it } from "vitest";

import {
  advanceStrokeAuthoringState,
  createStrokeAuthoringState,
  shouldSampleControlPoint,
  type StrokePointerFrame,
} from "./stroke-authoring.js";

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
});

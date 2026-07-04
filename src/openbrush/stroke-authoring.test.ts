import { describe, expect, it } from "vitest";

import {
  advanceStrokeAuthoringState,
  createMirroredStrokeDataX,
  createStrokeAuthoringState,
  shouldSampleControlPoint,
  upsertStraightedgeEndpoint,
  writeGridSnappedPosition,
  writeLazyInputPosition,
  type StrokePointerFrame,
} from "./stroke-authoring.js";
import { StrokeFlags, createEmptyStrokeData, type ControlPoint } from "./types.js";

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

  it("snaps positions to a fixed grid without allocating a result vector", () => {
    const target: [number, number, number] = [0, 0, 0];
    const source: [number, number, number] = [0.134, 1.249, -0.151];

    writeGridSnappedPosition(target, source, 0.1);

    expect(target).toEqual([0.1, 1.2000000000000002, -0.2]);
    expect(source).toEqual([0.134, 1.249, -0.151]);
  });

  it("copies positions unchanged when grid size is disabled", () => {
    const target: [number, number, number] = [0, 0, 0];
    const source: [number, number, number] = [0.134, 1.249, -0.151];

    writeGridSnappedPosition(target, source, 0);

    expect(target).toEqual(source);
    expect(target).not.toBe(source);
  });

  it("keeps lazy input anchored until the pointer leaves the radius", () => {
    const target: [number, number, number] = [0, 0, 0];
    const anchor: [number, number, number] = [1, 2, 3];

    writeLazyInputPosition(target, anchor, [1.03, 2, 3], 0.05);

    expect(target).toEqual(anchor);
  });

  it("moves lazy input toward the pointer while preserving the leash radius", () => {
    const target: [number, number, number] = [0, 0, 0];

    writeLazyInputPosition(target, [0, 0, 0], [0.2, 0, 0], 0.05);

    expect(target).toEqual([0.15000000000000002, 0, 0]);
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

  it("mirrors stroke data across the X axis with group continuation metadata", () => {
    const source = createEmptyStrokeData({
      guid: "source",
      seed: 12,
      groupId: 7,
      color: [0.2, 0.4, 0.6, 1],
      controlPoints: [
        {
          position: [0.25, 1, -0.5],
          orientation: [0, 0, 0, 1],
          pressure: 0.5,
          timestampMs: 100,
        },
        {
          position: [-0.75, 2, -0.25],
          orientation: [0, 0.5, 0, 0.5],
          pressure: 1,
          timestampMs: 200,
        },
      ],
    });

    const mirrored = createMirroredStrokeDataX(source, {
      guid: "mirror",
      seed: 13,
    });

    expect(mirrored.guid).toBe("mirror");
    expect(mirrored.seed).toBe(13);
    expect(mirrored.groupId).toBe(7);
    expect(mirrored.flags & StrokeFlags.IsGroupContinue).toBe(
      StrokeFlags.IsGroupContinue,
    );
    expect(mirrored.color).toEqual(source.color);
    expect(mirrored.color).not.toBe(source.color);
    expect(mirrored.controlPoints).toHaveLength(2);
    expect(mirrored.controlPoints[0].position).toEqual([-0.25, 1, -0.5]);
    expect(mirrored.controlPoints[1].position).toEqual([0.75, 2, -0.25]);
  });
});

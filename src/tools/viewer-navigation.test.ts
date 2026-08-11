import { describe, expect, it } from "vitest";

import {
  VIEWER_BOUNDS_RADIUS_METERS,
  VIEWER_LOOK_SPEED,
  VIEWER_MAX_PITCH_RADIANS,
  VIEWER_MOVE_SPEED_METERS_PER_SECOND,
  VIEWER_SPRINT_MULTIPLIER,
  applyViewerLookDelta,
  applyViewerStickCurve,
  clampViewerPitch,
  clampViewerScenePosition,
  createViewerLookState,
  resolveViewerMoveSpeed,
  resolveViewerMoveVector,
  wrapViewerYaw,
} from "./viewer-navigation.js";
import type { Vec3 } from "../types.js";

function move(input: Partial<Parameters<typeof resolveViewerMoveVector>[0]>) {
  return resolveViewerMoveVector({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    ...input,
  });
}

describe("viewer look", () => {
  it("turns left when dragging right and looks up when dragging up", () => {
    const state = createViewerLookState();
    applyViewerLookDelta(state, { x: 0.5, y: -0.25 });
    expect(state.yaw).toBeCloseTo(-0.5 * VIEWER_LOOK_SPEED);
    expect(state.pitch).toBeCloseTo(0.25 * VIEWER_LOOK_SPEED);
  });

  it("inverts the pitch axis when invert look is on", () => {
    const normal = applyViewerLookDelta(createViewerLookState(), {
      x: 0,
      y: 0.2,
    });
    const inverted = applyViewerLookDelta(
      createViewerLookState(),
      { x: 0, y: 0.2 },
      true,
    );
    expect(inverted.pitch).toBeCloseTo(-normal.pitch);
  });

  it("clamps pitch to the FlyTool limit", () => {
    expect(clampViewerPitch(Math.PI)).toBeCloseTo(VIEWER_MAX_PITCH_RADIANS);
    expect(clampViewerPitch(-Math.PI)).toBeCloseTo(-VIEWER_MAX_PITCH_RADIANS);
    const state = createViewerLookState();
    applyViewerLookDelta(state, { x: 0, y: -10 });
    expect(state.pitch).toBeCloseTo(VIEWER_MAX_PITCH_RADIANS);
  });

  it("wraps yaw into (-PI, PI]", () => {
    expect(wrapViewerYaw(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapViewerYaw(-Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapViewerYaw(0.25)).toBeCloseTo(0.25);
  });

  it("applies a squared response curve to stick look", () => {
    expect(applyViewerStickCurve(0.5)).toBeCloseTo(0.25);
    expect(applyViewerStickCurve(-0.5)).toBeCloseTo(-0.25);
    expect(applyViewerStickCurve(1)).toBeCloseTo(1);
  });
});

describe("viewer movement", () => {
  it("maps keys to camera-local axes", () => {
    expect(move({ forward: true })).toEqual([0, 0, -1]);
    expect(move({ backward: true })).toEqual([0, 0, 1]);
    expect(move({ right: true })).toEqual([1, 0, 0]);
    expect(move({ left: true })).toEqual([-1, 0, 0]);
    expect(move({ up: true })).toEqual([0, 1, 0]);
    expect(move({ down: true })).toEqual([0, -1, 0]);
  });

  it("cancels opposing keys", () => {
    expect(move({ forward: true, backward: true })).toEqual([0, 0, 0]);
  });

  it("clamps diagonals to unit length", () => {
    const diagonal = move({ forward: true, right: true });
    const length = Math.hypot(diagonal[0], diagonal[1], diagonal[2]);
    expect(length).toBeCloseTo(1);
  });

  it("keeps analog stick input below the unit clamp", () => {
    expect(move({ stickX: 0.5 })[0]).toBeCloseTo(0.5);
    expect(move({ stickY: 0.5 })[2]).toBeCloseTo(-0.5);
    expect(move({ vertical: -0.25 })[1]).toBeCloseTo(-0.25);
  });

  it("multiplies speed while sprinting", () => {
    expect(resolveViewerMoveSpeed(false)).toBe(
      VIEWER_MOVE_SPEED_METERS_PER_SECOND,
    );
    expect(resolveViewerMoveSpeed(true)).toBe(
      VIEWER_MOVE_SPEED_METERS_PER_SECOND * VIEWER_SPRINT_MULTIPLIER,
    );
  });
});

describe("scene bounds", () => {
  it("leaves in-bounds positions untouched", () => {
    const position: Vec3 = [1, 2, 3];
    expect(clampViewerScenePosition(position)).toEqual([1, 2, 3]);
  });

  it("clamps runaway positions to the bounds radius", () => {
    const position: Vec3 = [VIEWER_BOUNDS_RADIUS_METERS * 10, 0, 0];
    clampViewerScenePosition(position);
    expect(position[0]).toBeCloseTo(VIEWER_BOUNDS_RADIUS_METERS);
    expect(Math.hypot(position[0], position[1], position[2])).toBeCloseTo(
      VIEWER_BOUNDS_RADIUS_METERS,
    );
  });
});

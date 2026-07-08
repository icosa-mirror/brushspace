import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_WORLD_TRANSFORM_MAX_SCALE,
  OPEN_BRUSH_WORLD_TRANSFORM_MIN_SCALE,
  applyOpenBrushTwoHandGrab,
  constrainRotationDeltaToAxis,
  createWorldGrabGrip,
  createWorldGrabPose,
  type Quat,
  type WorldGrabGrip,
} from "./world-grab.js";
import type { Vec3 } from "../types.js";

function grip(position: Vec3, orientation: Quat = [0, 0, 0, 1]): WorldGrabGrip {
  const result = createWorldGrabGrip();
  result.position[0] = position[0];
  result.position[1] = position[1];
  result.position[2] = position[2];
  result.orientation[0] = orientation[0];
  result.orientation[1] = orientation[1];
  result.orientation[2] = orientation[2];
  result.orientation[3] = orientation[3];
  return result;
}

function quatAboutY(radians: number): Quat {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

describe("Open Brush two-hand world grab", () => {
  it("translates the pose when both hands move together", () => {
    const pose = createWorldGrabPose();
    applyOpenBrushTwoHandGrab(
      pose,
      grip([-0.2, 1, -0.5]),
      grip([0.2, 1, -0.5]),
      grip([-0.2 + 0.1, 1.05, -0.5]),
      grip([0.2 + 0.1, 1.05, -0.5]),
    );
    expect(pose.position[0]).toBeCloseTo(0.1);
    expect(pose.position[1]).toBeCloseTo(0.05);
    expect(pose.position[2]).toBeCloseTo(0);
    expect(pose.scale).toBeCloseTo(1);
    expect(pose.orientation).toEqual([0, 0, 0, 1]);
  });

  it("scales uniformly about the grip midpoint", () => {
    const pose = createWorldGrabPose();
    // Hands spread from 0.4m apart to 0.8m apart around midpoint (0, 1, -0.5).
    applyOpenBrushTwoHandGrab(
      pose,
      grip([-0.2, 1, -0.5]),
      grip([0.2, 1, -0.5]),
      grip([-0.4, 1, -0.5]),
      grip([0.4, 1, -0.5]),
    );
    expect(pose.scale).toBeCloseTo(2);
    // The midpoint must be invariant: canvas point that was at the midpoint
    // maps back to the midpoint. world = pose * canvas.
    const canvasX = (0 - pose.position[0]) / pose.scale;
    const canvasY = (1 - pose.position[1]) / pose.scale;
    const canvasZ = (-0.5 - pose.position[2]) / pose.scale;
    expect(canvasX).toBeCloseTo(0);
    expect(canvasY).toBeCloseTo(1);
    expect(canvasZ).toBeCloseTo(-0.5);
  });

  it("clamps the total scene scale to the reference range", () => {
    const pose = createWorldGrabPose();
    pose.scale = 8;
    applyOpenBrushTwoHandGrab(
      pose,
      grip([-0.1, 1, -0.5]),
      grip([0.1, 1, -0.5]),
      grip([-0.4, 1, -0.5]),
      grip([0.4, 1, -0.5]),
    );
    expect(pose.scale).toBeCloseTo(OPEN_BRUSH_WORLD_TRANSFORM_MAX_SCALE);

    const small = createWorldGrabPose();
    small.scale = 0.12;
    applyOpenBrushTwoHandGrab(
      small,
      grip([-0.4, 1, -0.5]),
      grip([0.4, 1, -0.5]),
      grip([-0.1, 1, -0.5]),
      grip([0.1, 1, -0.5]),
    );
    expect(small.scale).toBeCloseTo(OPEN_BRUSH_WORLD_TRANSFORM_MIN_SCALE);
  });

  it("rotates about the world up axis when hands orbit", () => {
    const pose = createWorldGrabPose();
    // Hands swing 90 degrees around the vertical axis through the midpoint.
    applyOpenBrushTwoHandGrab(
      pose,
      grip([-0.2, 1, 0]),
      grip([0.2, 1, 0]),
      grip([0, 1, -0.2]),
      grip([0, 1, 0.2]),
    );
    expect(pose.scale).toBeCloseTo(1);
    // Quaternion should be about Y only.
    expect(pose.orientation[0]).toBeCloseTo(0);
    expect(pose.orientation[2]).toBeCloseTo(0);
    expect(Math.abs(pose.orientation[1])).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("suppresses tilt: vertical hand offsets produce no roll or pitch", () => {
    const pose = createWorldGrabPose();
    // Right hand rises: without tilt protection this would roll the scene.
    applyOpenBrushTwoHandGrab(
      pose,
      grip([-0.2, 1, -0.5]),
      grip([0.2, 1, -0.5]),
      grip([-0.2, 0.95, -0.5]),
      grip([0.2, 1.1, -0.5]),
    );
    expect(pose.orientation[0]).toBeCloseTo(0, 5);
    expect(pose.orientation[2]).toBeCloseTo(0, 5);
  });

  it("constrains rotation deltas to the requested axis", () => {
    const out: Quat = [0, 0, 0, 1];
    const yaw = quatAboutY(Math.PI / 2);
    constrainRotationDeltaToAxis([0, 0, 0, 1], yaw, [0, 1, 0], out);
    expect(out[1]).toBeCloseTo(yaw[1]);
    expect(out[3]).toBeCloseTo(yaw[3]);

    // A pure pitch delta has no component about Y.
    const pitch: Quat = [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)];
    constrainRotationDeltaToAxis([0, 0, 0, 1], pitch, [0, 1, 0], out);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);
    expect(out[3]).toBeCloseTo(1);
  });
});

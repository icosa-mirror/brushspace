import { describe, expect, it } from "vitest";

import {
  writeOpenBrushToolForwardDirection,
  writeOpenBrushToolLocalForwardOffset,
  writeOpenBrushToolOffsetPosition,
} from "./tool-pose.js";
import type { Vec3 } from "../types.js";

describe("Open Brush tool pose", () => {
  it("uses local -Z as the controller forward offset", () => {
    const target: Vec3 = [1, 2, 3];

    expect(writeOpenBrushToolLocalForwardOffset(target, 0.05)).toEqual([
      0, 0, -0.05,
    ]);
    expect(writeOpenBrushToolLocalForwardOffset(target, -1)).toEqual([0, 0, 0]);
  });

  it("writes an offset world position from the same local forward axis", () => {
    const target: Vec3 = [0, 0, 0];

    expect(
      writeOpenBrushToolOffsetPosition(
        target,
        { x: 1, y: 2, z: 3 },
        { x: 0, y: 0, z: 0, w: 1 },
        0.25,
      ),
    ).toEqual([1, 2, 2.75]);
  });

  it("rotates local -Z through the controller orientation", () => {
    const target: Vec3 = [0, 0, 0];
    const halfTurn = Math.PI * 0.25;
    const direction = writeOpenBrushToolForwardDirection(target, {
      x: 0,
      y: Math.sin(halfTurn),
      z: 0,
      w: Math.cos(halfTurn),
    });

    expect(direction[0]).toBeCloseTo(-1);
    expect(direction[1]).toBeCloseTo(0);
    expect(direction[2]).toBeCloseTo(0);
  });
});

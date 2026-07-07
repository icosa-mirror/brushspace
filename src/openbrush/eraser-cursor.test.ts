import { describe, expect, it } from "vitest";

import {
  buildOpenBrushToolSphereSegments,
  createOpenBrushEraserSpinState,
  isOpenBrushEraserCursorVisible,
  resolveOpenBrushToolSphereCursor,
  stepOpenBrushEraserSpin,
  writeOpenBrushEraserCursorLocalPosition,
  type OpenBrushToolSphereCursor,
} from "./eraser-cursor.js";
import {
  OPEN_BRUSH_DROPPER_FORWARD_OFFSET,
  OPEN_BRUSH_DROPPER_PICK_RADIUS,
  OPEN_BRUSH_ERASER_MAX_SPIN_SPEED,
} from "./tools.js";
import type { Vec3 } from "./types.js";

function scratchCursor(): OpenBrushToolSphereCursor {
  return { visible: true, radius: 9, forwardOffset: 9, spins: true };
}

describe("Open Brush eraser cursor", () => {
  it("is visible only while the eraser tool is active in XR", () => {
    expect(isOpenBrushEraserCursorVisible("eraser", "visible")).toBe(true);
    expect(isOpenBrushEraserCursorVisible("free-paint", "visible")).toBe(false);
    expect(isOpenBrushEraserCursorVisible("eraser", "non-immersive")).toBe(false);
  });

  it("sits directly on the drawing tip (no extra forward offset)", () => {
    const target: Vec3 = [1, 2, 3];

    expect(writeOpenBrushEraserCursorLocalPosition(target)).toEqual([0, 0, 0]);
  });

  it("resolves the sphere cursor for eraser and pick tools only", () => {
    const eraser = resolveOpenBrushToolSphereCursor(
      "eraser",
      "visible",
      0.025,
      scratchCursor(),
    );
    expect(eraser).toEqual({
      visible: true,
      radius: 0.025,
      forwardOffset: 0,
      spins: true,
    });

    const dropper = resolveOpenBrushToolSphereCursor(
      "dropper",
      "visible",
      0.02,
      scratchCursor(),
    );
    expect(dropper.visible).toBe(true);
    expect(dropper.radius).toBe(OPEN_BRUSH_DROPPER_PICK_RADIUS);
    expect(dropper.forwardOffset).toBe(OPEN_BRUSH_DROPPER_FORWARD_OFFSET);
    expect(dropper.spins).toBe(false);

    expect(
      resolveOpenBrushToolSphereCursor("free-paint", "visible", 0.02, scratchCursor())
        .visible,
    ).toBe(false);
    expect(
      resolveOpenBrushToolSphereCursor("eraser", "non-immersive", 0.02, scratchCursor())
        .visible,
    ).toBe(false);
  });

  it("spins up while hot, saturates at max speed, and winds down", () => {
    const spin = createOpenBrushEraserSpinState();
    stepOpenBrushEraserSpin(spin, true, 1 / 60);
    const speedAfterOneFrame = spin.speed;
    expect(speedAfterOneFrame).toBeGreaterThan(0);
    expect(spin.angle).toBeGreaterThan(0);

    for (let frame = 0; frame < 120; frame += 1) {
      stepOpenBrushEraserSpin(spin, true, 1 / 60);
    }
    expect(spin.speed).toBeCloseTo(OPEN_BRUSH_ERASER_MAX_SPIN_SPEED);

    for (let frame = 0; frame < 120; frame += 1) {
      stepOpenBrushEraserSpin(spin, false, 1 / 60);
    }
    expect(spin.speed).toBe(0);
    expect(spin.velocity).toBe(0);
  });

  it("builds unit-radius globe segments for the fat-line cursor", () => {
    const segments = 48;
    const positions = buildOpenBrushToolSphereSegments(segments);
    // 5 circles (3 latitudes + 2 meridians), 2 points x 3 floats per segment.
    expect(positions.length).toBe(5 * segments * 6);
    for (let index = 0; index < positions.length; index += 3) {
      const radius = Math.hypot(
        positions[index],
        positions[index + 1],
        positions[index + 2],
      );
      expect(radius).toBeCloseTo(1, 5);
    }
  });
});

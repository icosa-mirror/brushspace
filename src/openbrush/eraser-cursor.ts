import type { Vec3 } from "./types.js";

import { writeOpenBrushToolLocalForwardOffset } from "./tool-pose.js";
import {
  OPEN_BRUSH_DROPPER_FORWARD_OFFSET,
  OPEN_BRUSH_DROPPER_PICK_RADIUS,
  OPEN_BRUSH_ERASER_FORWARD_OFFSET,
  OPEN_BRUSH_ERASER_MAX_SPIN_SPEED,
  OPEN_BRUSH_ERASER_SPIN_ACCELERATION,
  OPEN_BRUSH_ERASER_SPIN_DECAY,
  normalizeOpenBrushEraserRadius,
} from "./tools.js";

export function isOpenBrushEraserCursorVisible(
  activeTool: string,
  visibilityState: string,
): boolean {
  return activeTool === "eraser" && visibilityState !== "non-immersive";
}

export function writeOpenBrushEraserCursorLocalPosition(
  target: Vec3,
  forwardOffset = OPEN_BRUSH_ERASER_FORWARD_OFFSET,
): Vec3 {
  return writeOpenBrushToolLocalForwardOffset(target, forwardOffset);
}

/**
 * The sphere cursor shared by the stroke-modification tools, mirroring Open
 * Brush where the eraser and the pick tools all present the selection sphere
 * at the tool attach point. The sphere shows the true intersection volume;
 * only the eraser spins (EraserTool.UpdateAudioVisuals).
 */
export interface OpenBrushToolSphereCursor {
  visible: boolean;
  radius: number;
  forwardOffset: number;
  spins: boolean;
}

export function resolveOpenBrushToolSphereCursor(
  activeTool: string,
  visibilityState: string,
  eraserRadius: number,
  out: OpenBrushToolSphereCursor,
): OpenBrushToolSphereCursor {
  out.visible = false;
  out.radius = 0;
  out.forwardOffset = 0;
  out.spins = false;
  if (visibilityState === "non-immersive") {
    return out;
  }
  switch (activeTool) {
    case "eraser":
      out.visible = true;
      out.radius = normalizeOpenBrushEraserRadius(eraserRadius);
      out.forwardOffset = OPEN_BRUSH_ERASER_FORWARD_OFFSET;
      out.spins = true;
      return out;
    case "dropper":
      out.visible = true;
      out.radius = OPEN_BRUSH_DROPPER_PICK_RADIUS;
      out.forwardOffset = OPEN_BRUSH_DROPPER_FORWARD_OFFSET;
      return out;
    default:
      return out;
  }
}

/** Spin integrator state for the eraser sphere (EraserTool fields). */
export interface OpenBrushEraserSpinState {
  speed: number;
  velocity: number;
  angle: number;
}

export function createOpenBrushEraserSpinState(): OpenBrushEraserSpinState {
  return { speed: 0, velocity: 0, angle: 0 };
}

/**
 * Port of EraserTool.UpdateAudioVisuals: the sphere spins up while the
 * trigger is held (that is the erase feedback) and winds down on release.
 */
export function stepOpenBrushEraserSpin(
  state: OpenBrushEraserSpinState,
  hot: boolean,
  deltaSeconds: number,
): OpenBrushEraserSpinState {
  const delta = Math.max(0, deltaSeconds);
  if (hot) {
    state.velocity += OPEN_BRUSH_ERASER_SPIN_ACCELERATION * delta;
    state.speed = Math.min(
      state.speed + state.velocity * delta,
      OPEN_BRUSH_ERASER_MAX_SPIN_SPEED,
    );
  } else {
    state.speed = Math.max(state.speed - OPEN_BRUSH_ERASER_SPIN_DECAY * delta, 0);
    state.velocity = 0;
  }
  state.angle = (state.angle + state.speed * delta) % (Math.PI * 2);
  return state;
}

/**
 * Unit-radius wireframe globe as fat-line segment pairs (LineSegmentsGeometry
 * positions): three latitude rings (equator and ±45°) plus two great circles
 * through the poles — the simple wireframe look of Open Brush's
 * selectionsphere tool mesh, rendered thick instead of as a triangulated
 * three.js wireframe.
 */
export function buildOpenBrushToolSphereSegments(
  segmentsPerCircle = 48,
): Float32Array {
  const circles: Array<(angle: number) => [number, number, number]> = [
    // Latitudes around Y: equator and ±45°.
    (a) => [Math.cos(a), 0, Math.sin(a)],
    (a) => [
      Math.cos(a) * Math.SQRT1_2,
      Math.SQRT1_2,
      Math.sin(a) * Math.SQRT1_2,
    ],
    (a) => [
      Math.cos(a) * Math.SQRT1_2,
      -Math.SQRT1_2,
      Math.sin(a) * Math.SQRT1_2,
    ],
    // Meridian great circles through the poles (XZ planes at 0° and 90°).
    (a) => [Math.cos(a), Math.sin(a), 0],
    (a) => [0, Math.sin(a), Math.cos(a)],
  ];
  const positions = new Float32Array(circles.length * segmentsPerCircle * 6);
  let cursor = 0;
  for (const circle of circles) {
    for (let index = 0; index < segmentsPerCircle; index += 1) {
      const start = circle((index / segmentsPerCircle) * Math.PI * 2);
      const end = circle(((index + 1) / segmentsPerCircle) * Math.PI * 2);
      positions[cursor] = start[0];
      positions[cursor + 1] = start[1];
      positions[cursor + 2] = start[2];
      positions[cursor + 3] = end[0];
      positions[cursor + 4] = end[1];
      positions[cursor + 5] = end[2];
      cursor += 6;
    }
  }
  return positions;
}

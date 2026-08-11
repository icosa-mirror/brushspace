import type { Vec3 } from "../types.js";

/**
 * Flatscreen viewer navigation math — port of FlyTool's non-VR branch
 * (`Tools/FlyTool.cs`, the `!App.VrSdk.IsHmdInitialized()` path).
 *
 * Look drives the camera; movement is applied inversely to the scene pose
 * (`App.Scene.Pose.translation -= cameraRotation * input * speed`) and
 * clamped to the hard bounds radius, matching MakeValidScenePose.
 */

/** FlyTool.MaxPitch — degrees of pitch before the look clamps. */
export const VIEWER_MAX_PITCH_RADIANS = (85 * Math.PI) / 180;
/** FlyTool.LookSpeed, in radians of yaw per unit of normalized drag. */
export const VIEWER_LOOK_SPEED = Math.PI;
/**
 * FlyTool.MoveSpeed is 0.05 per frame; expressed per second (at the 60fps the
 * original assumes) so the browser path is frame-rate independent.
 */
export const VIEWER_MOVE_SPEED_METERS_PER_SECOND = 3;
/** FlyTool.SprintMultiplier. */
export const VIEWER_SPRINT_MULTIPLIER = 5;
/** SceneSettings.HardBoundsRadiusMeters_SS analog for the browser viewer. */
export const VIEWER_BOUNDS_RADIUS_METERS = 250;

export interface ViewerLookState {
  yaw: number;
  pitch: number;
}

export interface ViewerLookDelta {
  /** Normalized horizontal drag (fraction of viewport width). */
  x: number;
  /** Normalized vertical drag (fraction of viewport height). */
  y: number;
}

export interface ViewerMoveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** Analog stick contribution, each axis in [-1, 1]. */
  stickX?: number;
  stickY?: number;
  /** Analog vertical contribution (trigger pair), in [-1, 1]. */
  vertical?: number;
}

export function createViewerLookState(): ViewerLookState {
  return { yaw: 0, pitch: 0 };
}

export function clampViewerPitch(pitch: number): number {
  return Math.min(
    VIEWER_MAX_PITCH_RADIANS,
    Math.max(-VIEWER_MAX_PITCH_RADIANS, pitch),
  );
}

/** Wraps yaw into (-PI, PI], mirroring FlyTool's ±180° normalization. */
export function wrapViewerYaw(yaw: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = yaw % twoPi;
  if (wrapped <= -Math.PI) {
    wrapped += twoPi;
  } else if (wrapped > Math.PI) {
    wrapped -= twoPi;
  }
  return wrapped;
}

/**
 * Applies a look delta in place. Dragging right turns right and dragging up
 * looks up (FlyTool subtracts mv.y unless invert-look is on).
 */
export function applyViewerLookDelta(
  state: ViewerLookState,
  delta: ViewerLookDelta,
  invertLook = false,
): ViewerLookState {
  state.yaw = wrapViewerYaw(state.yaw - delta.x * VIEWER_LOOK_SPEED);
  const pitchDelta = delta.y * VIEWER_LOOK_SPEED;
  state.pitch = clampViewerPitch(
    state.pitch + (invertLook ? pitchDelta : -pitchDelta),
  );
  return state;
}

/** Squared response curve on stick look, as FlyTool applies to rightStick. */
export function applyViewerStickCurve(value: number): number {
  return value * Math.abs(value);
}

/**
 * Composes the camera-local movement direction. Not normalized beyond a unit
 * clamp so diagonal keyboard movement matches the original's feel while stick
 * input stays analog.
 */
export function resolveViewerMoveVector(input: ViewerMoveInput): Vec3 {
  let x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let y = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  let z = (input.backward ? 1 : 0) - (input.forward ? 1 : 0);
  x += input.stickX ?? 0;
  z -= input.stickY ?? 0;
  y += input.vertical ?? 0;
  const lengthSquared = x * x + y * y + z * z;
  if (lengthSquared > 1) {
    const length = Math.sqrt(lengthSquared);
    x /= length;
    y /= length;
    z /= length;
  }
  return [x, y, z];
}

export function resolveViewerMoveSpeed(sprinting: boolean): number {
  return (
    VIEWER_MOVE_SPEED_METERS_PER_SECOND *
    (sprinting ? VIEWER_SPRINT_MULTIPLIER : 1)
  );
}

/**
 * Clamps a scene-pose translation to the bounds radius (MakeValidScenePose).
 * Mutates and returns the input array.
 */
export function clampViewerScenePosition(
  position: Vec3,
  radius = VIEWER_BOUNDS_RADIUS_METERS,
): Vec3 {
  const lengthSquared =
    position[0] * position[0] +
    position[1] * position[1] +
    position[2] * position[2];
  if (lengthSquared <= radius * radius) {
    return position;
  }
  const scale = radius / Math.sqrt(lengthSquared);
  position[0] *= scale;
  position[1] *= scale;
  position[2] *= scale;
  return position;
}

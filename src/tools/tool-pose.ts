import type { Vec3 } from "../types.js";

export interface OpenBrushPositionLike {
  x: number;
  y: number;
  z: number;
}

export interface OpenBrushQuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export function writeOpenBrushToolLocalForwardOffset(
  target: Vec3,
  forwardOffset: number,
): Vec3 {
  const offset = Math.max(0, forwardOffset);
  target[0] = 0;
  target[1] = 0;
  target[2] = offset === 0 ? 0 : -offset;
  return target;
}

export function writeOpenBrushToolForwardDirection(
  target: Vec3,
  orientation: OpenBrushQuaternionLike,
): Vec3 {
  const qx = orientation.x;
  const qy = orientation.y;
  const qz = orientation.z;
  const qw = orientation.w;

  const tx = -2 * qy;
  const ty = 2 * qx;
  const tz = 0;

  target[0] = qw * tx + qy * tz - qz * ty;
  target[1] = qw * ty + qz * tx - qx * tz;
  target[2] = -1 + qw * tz + qx * ty - qy * tx;

  const length = Math.hypot(target[0], target[1], target[2]);
  if (length > 0) {
    target[0] /= length;
    target[1] /= length;
    target[2] /= length;
  }
  return target;
}

export function writeOpenBrushToolOffsetPosition(
  target: Vec3,
  position: OpenBrushPositionLike,
  orientation: OpenBrushQuaternionLike,
  forwardOffset: number,
): Vec3 {
  target[0] = position.x;
  target[1] = position.y;
  target[2] = position.z;
  const offset = Math.max(0, forwardOffset);
  if (offset <= 0) {
    return target;
  }

  writeOpenBrushToolForwardDirection(target, orientation);
  target[0] = position.x + target[0] * offset;
  target[1] = position.y + target[1] * offset;
  target[2] = position.z + target[2] * offset;
  return target;
}

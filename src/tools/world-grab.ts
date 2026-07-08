import type { Vec3 } from "../types.js";

// SketchControlsScript world-transform limits (m_WorldTransformMinScale /
// m_WorldTransformMaxScale): the total scene scale stays within [0.1, 10].
export const OPEN_BRUSH_WORLD_TRANSFORM_MIN_SCALE = 0.1;
export const OPEN_BRUSH_WORLD_TRANSFORM_MAX_SCALE = 10;

export type Quat = [number, number, number, number];

/** Uniform TRS pose of the grabbed scene (App.Scene.Pose equivalent). */
export interface WorldGrabPose {
  position: Vec3;
  orientation: Quat;
  scale: number;
}

export interface WorldGrabGrip {
  position: Vec3;
  orientation: Quat;
}

export function createWorldGrabPose(): WorldGrabPose {
  return { position: [0, 0, 0], orientation: [0, 0, 0, 1], scale: 1 };
}

export function createWorldGrabGrip(): WorldGrabGrip {
  return { position: [0, 0, 0], orientation: [0, 0, 0, 1] };
}

export function copyWorldGrabGrip(
  target: WorldGrabGrip,
  source: WorldGrabGrip,
): void {
  target.position[0] = source.position[0];
  target.position[1] = source.position[1];
  target.position[2] = source.position[2];
  target.orientation[0] = source.orientation[0];
  target.orientation[1] = source.orientation[1];
  target.orientation[2] = source.orientation[2];
  target.orientation[3] = source.orientation[3];
}

function qDot(a: Quat, b: Quat): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function qMultiply(a: Quat, b: Quat, out: Quat): Quat {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by + ay * bw + az * bx - ax * bz;
  out[2] = aw * bz + az * bw + ax * by - ay * bx;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

function qConjugate(q: Quat, out: Quat): Quat {
  out[0] = -q[0];
  out[1] = -q[1];
  out[2] = -q[2];
  out[3] = q[3];
  return out;
}

function qNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length > 0) {
    q[0] /= length;
    q[1] /= length;
    q[2] /= length;
    q[3] /= length;
  } else {
    q[0] = 0;
    q[1] = 0;
    q[2] = 0;
    q[3] = 1;
  }
  return q;
}

function qRotateVec3(q: Quat, v: Vec3, out: Vec3): Vec3 {
  const qx = q[0];
  const qy = q[1];
  const qz = q[2];
  const qw = q[3];
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  out[0] = v[0] + qw * tx + qy * tz - qz * ty;
  out[1] = v[1] + qw * ty + qz * tx - qx * tz;
  out[2] = v[2] + qw * tz + qx * ty - qy * tx;
  return out;
}

function qSlerp(a: Quat, b: Quat, t: number, out: Quat): Quat {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let cosTheta = qDot(a, b);
  if (cosTheta < 0) {
    cosTheta = -cosTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let scale0: number;
  let scale1: number;
  if (cosTheta > 0.9995) {
    scale0 = 1 - t;
    scale1 = t;
  } else {
    const theta = Math.acos(Math.min(1, cosTheta));
    const sinTheta = Math.sin(theta);
    scale0 = Math.sin((1 - t) * theta) / sinTheta;
    scale1 = Math.sin(t * theta) / sinTheta;
  }
  out[0] = a[0] * scale0 + bx * scale1;
  out[1] = a[1] * scale0 + by * scale1;
  out[2] = a[2] * scale0 + bz * scale1;
  out[3] = a[3] * scale0 + bw * scale1;
  return qNormalize(out);
}

/** Quaternion.FromToRotation: shortest arc rotating v0 onto v1. */
function qFromToRotation(v0: Vec3, v1: Vec3, out: Quat): Quat {
  const len0 = Math.hypot(v0[0], v0[1], v0[2]);
  const len1 = Math.hypot(v1[0], v1[1], v1[2]);
  if (len0 === 0 || len1 === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
  }
  const cx = v0[1] * v1[2] - v0[2] * v1[1];
  const cy = v0[2] * v1[0] - v0[0] * v1[2];
  const cz = v0[0] * v1[1] - v0[1] * v1[0];
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  const w = len0 * len1 + dot;
  if (w < 1e-9 * len0 * len1) {
    // Antiparallel: rotate 180 degrees about any perpendicular axis.
    const axis: Vec3 =
      Math.abs(v0[0]) > Math.abs(v0[2]) ? [-v0[1], v0[0], 0] : [0, -v0[2], v0[1]];
    const axisLength = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    out[0] = axis[0] / axisLength;
    out[1] = axis[1] / axisLength;
    out[2] = axis[2] / axisLength;
    out[3] = 0;
    return out;
  }
  out[0] = cx;
  out[1] = cy;
  out[2] = cz;
  out[3] = w;
  return qNormalize(out);
}

/**
 * MathUtils.ConstrainRotationDelta: the twist component of (q1 * inv(q0))
 * about `axis` — quaternion log projected onto the axis, then exp.
 */
export function constrainRotationDeltaToAxis(
  q0: Quat,
  q1: Quat,
  axis: Vec3,
  out: Quat,
): Quat {
  const b: Quat = [q1[0], q1[1], q1[2], q1[3]];
  if (qDot(q0, q1) < 0) {
    b[0] = -b[0];
    b[1] = -b[1];
    b[2] = -b[2];
    b[3] = -b[3];
  }
  const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLength === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
  }
  const ax = axis[0] / axisLength;
  const ay = axis[1] / axisLength;
  const az = axis[2] / axisLength;

  const inv: Quat = [0, 0, 0, 1];
  qConjugate(q0, inv);
  const delta: Quat = [0, 0, 0, 1];
  qMultiply(b, inv, delta);
  qNormalize(delta);

  // log(delta).Im = axis-of-rotation * (angle / 2)
  const sinHalf = Math.hypot(delta[0], delta[1], delta[2]);
  const halfAngle = Math.atan2(sinHalf, delta[3]);
  let lx = 0;
  let ly = 0;
  let lz = 0;
  if (sinHalf > 1e-9) {
    const factor = halfAngle / sinHalf;
    lx = delta[0] * factor;
    ly = delta[1] * factor;
    lz = delta[2] * factor;
  }
  const projected = ax * lx + ay * ly + az * lz;
  // exp(axis * projected)
  out[0] = ax * Math.sin(projected);
  out[1] = ay * Math.sin(projected);
  out[2] = az * Math.sin(projected);
  out[3] = Math.cos(projected);
  return out;
}

const UP: Vec3 = [0, 1, 0];
const IDENTITY: Quat = [0, 0, 0, 1];

const scratchVLR0: Vec3 = [0, 0, 0];
const scratchVLR1: Vec3 = [0, 0, 0];
const scratchSwing: Quat = [0, 0, 0, 1];
const scratchTwistL: Quat = [0, 0, 0, 1];
const scratchTwistR: Quat = [0, 0, 0, 1];
const scratchTwist: Quat = [0, 0, 0, 1];
const scratchDelta: Quat = [0, 0, 0, 1];
const scratchVec: Vec3 = [0, 0, 0];

/**
 * Port of MathUtils.TwoPointObjectTransformation as used by
 * SketchControlsScript.UpdateGrab_World: pivot at the grip midpoint, uniform
 * scale from the hand-distance ratio (clamped so the total scene scale stays
 * in range), rotation from the between-hands vector plus the averaged twist,
 * constrained to the world up axis while tilt protection is on.
 */
export function applyOpenBrushTwoHandGrab(
  pose: WorldGrabPose,
  previousLeft: WorldGrabGrip,
  previousRight: WorldGrabGrip,
  currentLeft: WorldGrabGrip,
  currentRight: WorldGrabGrip,
  tiltProtection = true,
): WorldGrabPose {
  scratchVLR0[0] = previousRight.position[0] - previousLeft.position[0];
  scratchVLR0[1] = previousRight.position[1] - previousLeft.position[1];
  scratchVLR0[2] = previousRight.position[2] - previousLeft.position[2];
  scratchVLR1[0] = currentRight.position[0] - currentLeft.position[0];
  scratchVLR1[1] = currentRight.position[1] - currentLeft.position[1];
  scratchVLR1[2] = currentRight.position[2] - currentLeft.position[2];

  const pivot0x = (previousLeft.position[0] + previousRight.position[0]) * 0.5;
  const pivot0y = (previousLeft.position[1] + previousRight.position[1]) * 0.5;
  const pivot0z = (previousLeft.position[2] + previousRight.position[2]) * 0.5;
  const pivot1x = (currentLeft.position[0] + currentRight.position[0]) * 0.5;
  const pivot1y = (currentLeft.position[1] + currentRight.position[1]) * 0.5;
  const pivot1z = (currentLeft.position[2] + currentRight.position[2]) * 0.5;

  const dist0 = Math.hypot(scratchVLR0[0], scratchVLR0[1], scratchVLR0[2]);
  const dist1 = Math.hypot(scratchVLR1[0], scratchVLR1[1], scratchVLR1[2]);
  let deltaScale = dist0 === 0 ? 1 : dist1 / dist0;
  deltaScale = Math.max(
    deltaScale,
    OPEN_BRUSH_WORLD_TRANSFORM_MIN_SCALE / pose.scale,
  );
  deltaScale = Math.min(
    deltaScale,
    OPEN_BRUSH_WORLD_TRANSFORM_MAX_SCALE / pose.scale,
  );

  qFromToRotation(scratchVLR0, scratchVLR1, scratchSwing);
  constrainRotationDeltaToAxis(
    previousLeft.orientation,
    currentLeft.orientation,
    scratchVLR0,
    scratchTwistL,
  );
  constrainRotationDeltaToAxis(
    previousRight.orientation,
    currentRight.orientation,
    scratchVLR0,
    scratchTwistR,
  );
  qSlerp(scratchTwistL, scratchTwistR, 0.5, scratchTwist);
  qMultiply(scratchSwing, scratchTwist, scratchDelta);
  if (tiltProtection) {
    constrainRotationDeltaToAxis(IDENTITY, scratchDelta, UP, scratchDelta);
  }

  // newPose = translate(pivot1) * RS(delta, scale) * translate(-pivot1)
  //         * translate(pivot1 - pivot0) * pose
  const translatedX = pose.position[0] + pivot1x - pivot0x - pivot1x;
  const translatedY = pose.position[1] + pivot1y - pivot0y - pivot1y;
  const translatedZ = pose.position[2] + pivot1z - pivot0z - pivot1z;
  scratchVec[0] = translatedX * deltaScale;
  scratchVec[1] = translatedY * deltaScale;
  scratchVec[2] = translatedZ * deltaScale;
  qRotateVec3(scratchDelta, scratchVec, scratchVec);
  pose.position[0] = scratchVec[0] + pivot1x;
  pose.position[1] = scratchVec[1] + pivot1y;
  pose.position[2] = scratchVec[2] + pivot1z;
  qMultiply(scratchDelta, pose.orientation, pose.orientation);
  qNormalize(pose.orientation);
  pose.scale *= deltaScale;
  return pose;
}

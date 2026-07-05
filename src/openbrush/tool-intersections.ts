import type { Vec3 } from "./types.js";

export interface EraserStrokeCandidate {
  layerIndex: number;
  finalized: boolean;
  visible: boolean;
  renderVisible: boolean;
  brushSize: number;
  minBounds: Vec3;
  maxBounds: Vec3;
}

export function strokeIntersectsEraser(
  stroke: EraserStrokeCandidate,
  activeLayerIndex: number,
  eraserCenter: Vec3,
  eraserRadius: number,
): boolean {
  if (
    stroke.layerIndex !== activeLayerIndex ||
    !stroke.finalized ||
    !stroke.visible ||
    !stroke.renderVisible
  ) {
    return false;
  }

  const strokeRadius = Math.max(0, stroke.brushSize) * 0.5;
  const radius = Math.max(0, eraserRadius) + strokeRadius;
  return (
    distanceSqToAabb(eraserCenter, stroke.minBounds, stroke.maxBounds) <=
    radius * radius
  );
}

function distanceSqToAabb(point: Vec3, min: Vec3, max: Vec3): number {
  let distanceSq = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis];
    if (value < min[axis]) {
      const delta = min[axis] - value;
      distanceSq += delta * delta;
    } else if (value > max[axis]) {
      const delta = value - max[axis];
      distanceSq += delta * delta;
    }
  }
  return distanceSq;
}

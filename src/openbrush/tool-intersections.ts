import type { Vec3 } from "./types.js";

export interface ToolStrokeIntersectionCandidate {
  layerIndex: number;
  finalized: boolean;
  visible: boolean;
  renderVisible: boolean;
  brushSize: number;
  minBounds: Vec3;
  maxBounds: Vec3;
  boundsOffset?: Vec3;
}

export function strokeIntersectsEraser(
  stroke: ToolStrokeIntersectionCandidate,
  activeLayerIndex: number,
  eraserCenter: Vec3,
  eraserRadius: number,
): boolean {
  return strokeIntersectsTool(stroke, activeLayerIndex, eraserCenter, eraserRadius);
}

export function strokeIntersectsTool(
  stroke: ToolStrokeIntersectionCandidate,
  activeLayerIndex: number,
  toolCenter: Vec3,
  toolRadius: number,
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
  const radius = Math.max(0, toolRadius) + strokeRadius;
  return (
    distanceSqToAabb(
      toolCenter,
      stroke.minBounds,
      stroke.maxBounds,
      stroke.boundsOffset,
    ) <=
    radius * radius
  );
}

function distanceSqToAabb(
  point: Vec3,
  min: Vec3,
  max: Vec3,
  offset?: Vec3,
): number {
  let distanceSq = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis];
    const offsetValue = offset?.[axis] ?? 0;
    const minValue = min[axis] + offsetValue;
    const maxValue = max[axis] + offsetValue;
    if (value < minValue) {
      const delta = minValue - value;
      distanceSq += delta * delta;
    } else if (value > maxValue) {
      const delta = value - maxValue;
      distanceSq += delta * delta;
    }
  }
  return distanceSq;
}

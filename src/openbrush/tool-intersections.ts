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
  boundsIncludeBrushWidth?: boolean;
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
  if (!canToolAffectStroke(stroke, activeLayerIndex)) {
    return false;
  }

  const strokeRadius = stroke.boundsIncludeBrushWidth
    ? 0
    : Math.max(0, stroke.brushSize) * 0.5;
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

export function canToolAffectStroke(
  stroke: ToolStrokeIntersectionCandidate,
  activeLayerIndex: number,
): boolean {
  return (
    stroke.layerIndex === activeLayerIndex &&
    stroke.finalized &&
    stroke.visible &&
    stroke.renderVisible
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

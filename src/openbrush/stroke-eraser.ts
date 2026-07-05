import {
  canToolAffectStroke,
  strokeIntersectsEraser,
  type ToolStrokeIntersectionCandidate,
} from "./tool-intersections.js";
import type { Vec3 } from "./types.js";

export interface OpenBrushEraserHitTarget<T> {
  value: T;
  candidate: ToolStrokeIntersectionCandidate;
  geometryHit?: boolean;
}

export function isOpenBrushEraserHit(
  target: OpenBrushEraserHitTarget<unknown>,
  activeLayerIndex: number,
  eraserCenter: Vec3,
  eraserRadius: number,
): boolean {
  if (!canToolAffectStroke(target.candidate, activeLayerIndex)) {
    return false;
  }

  return (
    target.geometryHit ??
    strokeIntersectsEraser(
      target.candidate,
      activeLayerIndex,
      eraserCenter,
      eraserRadius,
    )
  );
}

export function collectOpenBrushEraserHits<T>(
  targets: Iterable<OpenBrushEraserHitTarget<T>>,
  activeLayerIndex: number,
  eraserCenter: Vec3,
  eraserRadius: number,
): T[] {
  const hits: T[] = [];
  for (const target of targets) {
    if (isOpenBrushEraserHit(target, activeLayerIndex, eraserCenter, eraserRadius)) {
      hits.push(target.value);
    }
  }
  return hits;
}

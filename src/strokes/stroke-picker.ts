import {
  canToolAffectStroke,
  strokeIntersectsTool,
  type ToolStrokeIntersectionCandidate,
} from "../tools/tool-intersections.js";
import type { Vec3 } from "../types.js";

export interface OpenBrushPickerHitTarget<T> {
  value: T;
  candidate: ToolStrokeIntersectionCandidate;
  commandIndex: number;
  geometryHit?: boolean;
}

export function isOpenBrushPickerHit(
  target: OpenBrushPickerHitTarget<unknown>,
  activeLayerIndex: number,
  pickerCenter: Vec3,
  pickerRadius: number,
): boolean {
  if (!canToolAffectStroke(target.candidate, activeLayerIndex)) {
    return false;
  }

  return (
    target.geometryHit ??
    strokeIntersectsTool(
      target.candidate,
      activeLayerIndex,
      pickerCenter,
      pickerRadius,
    )
  );
}

export function findNewestOpenBrushPickerHit<T>(
  targets: Iterable<OpenBrushPickerHitTarget<T>>,
  activeLayerIndex: number,
  pickerCenter: Vec3,
  pickerRadius: number,
): T | undefined {
  let newestCommandIndex = -1;
  let newest: T | undefined;
  for (const target of targets) {
    if (
      target.commandIndex > newestCommandIndex &&
      isOpenBrushPickerHit(target, activeLayerIndex, pickerCenter, pickerRadius)
    ) {
      newestCommandIndex = target.commandIndex;
      newest = target.value;
    }
  }
  return newest;
}

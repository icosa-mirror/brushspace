import {
  brushSize01ToLiveBrushSize,
  liveBrushSizeToSize01,
  normalizeBrushSize01,
} from "./brush-size.js";
import { findBrushByGuid } from "./brush-inventory.js";
import type { BrushInventoryEntry } from "./brush-inventory.js";
import type { OpenBrushPickerToolSpec } from "./tools.js";
import type { Rgba } from "./types.js";

export interface OpenBrushBrushSettingsSnapshot {
  brushGuid: string;
  size01: number;
  size: number;
  color: Rgba;
}

export interface OpenBrushPickedStrokeSnapshot {
  brushGuid: string;
  brushSize: number;
  color: Rgba;
}

export function resolveOpenBrushPickerBrushSettings(
  spec: OpenBrushPickerToolSpec,
  current: OpenBrushBrushSettingsSnapshot,
  picked: OpenBrushPickedStrokeSnapshot,
  inventory: readonly BrushInventoryEntry[],
): OpenBrushBrushSettingsSnapshot {
  const next: OpenBrushBrushSettingsSnapshot = {
    brushGuid: current.brushGuid,
    size01: current.size01,
    size: current.size,
    color: [
      current.color[0],
      current.color[1],
      current.color[2],
      current.color[3],
    ],
  };

  if (spec.picksColor) {
    next.color = [
      picked.color[0],
      picked.color[1],
      picked.color[2],
      picked.color[3],
    ];
  }

  if (!spec.picksBrush) {
    return next;
  }

  next.brushGuid = picked.brushGuid;
  const brush = findBrushByGuid(inventory, next.brushGuid);
  next.size01 = spec.picksSize
    ? liveBrushSizeToSize01(picked.brushSize, brush?.brushSizeRange)
    : normalizeBrushSize01(current.size01);
  next.size = brushSize01ToLiveBrushSize(next.size01, brush?.brushSizeRange);
  return next;
}

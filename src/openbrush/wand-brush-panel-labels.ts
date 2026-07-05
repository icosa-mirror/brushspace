import {
  OPEN_BRUSH_DEFAULT_SIZE01,
  brushSize01ToLiveBrushSize,
  normalizeBrushSize01,
} from "./brush-size.js";
import type { BrushInventoryEntry } from "./brush-inventory.js";
import { formatOpenBrushSizeMeters } from "./size-labels.js";
import { openBrushEraserRadiusToSize01 } from "./tools.js";

export interface WandBrushPanelLabelInput {
  activeBrush: BrushInventoryEntry | undefined;
  activeBrushIndex: number;
  brushCount: number;
  brushSize01: number;
  brushSize: number | undefined;
  eraserRadius: number;
  eraserActive: boolean;
  panelFocusBlocked: boolean;
}

export interface WandBrushPanelLabels {
  activeBrushName: string;
  activeBrushMeta: string;
  wandBrushName: string;
  wandBrushMeta: string;
  wandBrushSize: string;
  sizeDown: string;
  sizeUp: string;
  warning: string;
}

export function resolveWandBrushPanelLabels(
  input: WandBrushPanelLabelInput,
): WandBrushPanelLabels {
  const activeBrush = input.activeBrush;
  const activeIndex = Math.max(0, input.activeBrushIndex);
  const brushCount = Math.max(0, input.brushCount);
  const catalogPosition = `${activeIndex + 1}/${brushCount}`;
  const size01 = normalizeBrushSize01(input.brushSize01);
  const brushSize = Number.isFinite(input.brushSize)
    ? Number(input.brushSize)
    : brushSize01ToLiveBrushSize(
        Number.isFinite(input.brushSize01) ? size01 : OPEN_BRUSH_DEFAULT_SIZE01,
        activeBrush?.brushSizeRange,
      );
  const brushSizeReadout = formatOpenBrushSizeMeters(brushSize);
  const brushMeta = activeBrush
    ? [
        activeBrush.geometryFamily,
        activeBrush.materialFamily,
        catalogPosition,
        `size ${Math.round(size01 * 100)}% (${brushSizeReadout})`,
      ].join(" / ")
    : "unavailable";
  const eraserSize01 = openBrushEraserRadiusToSize01(input.eraserRadius);
  const eraserRadiusReadout = formatOpenBrushSizeMeters(input.eraserRadius);
  const sizeLabel = input.eraserActive
    ? `Radius ${Math.round(eraserSize01 * 100)}% | ${eraserRadiusReadout}`
    : `Size ${Math.round(size01 * 100)}% | ${brushSizeReadout}`;
  const activeBrushMeta = input.eraserActive
    ? `${brushMeta} / ${sizeLabel.toLowerCase()}`
    : brushMeta;
  const wandBrushMeta = input.eraserActive
    ? input.panelFocusBlocked
      ? "panel focus"
      : "contact radius"
    : activeBrush
      ? input.panelFocusBlocked
        ? `${activeBrush.geometryFamily} / panel focus`
        : `${activeBrush.geometryFamily} / ${catalogPosition}`
      : "unavailable";

  return {
    activeBrushName: activeBrush?.name ?? "No brush",
    activeBrushMeta,
    wandBrushName: input.eraserActive ? "Eraser" : activeBrush?.name ?? "No brush",
    wandBrushMeta,
    wandBrushSize: sizeLabel,
    sizeDown: input.eraserActive ? "Radius -" : "Size -",
    sizeUp: input.eraserActive ? "Radius +" : "Size +",
    warning: activeBrush?.unsupportedReason ?? "Ready",
  };
}

import generatedManifest from "./generated/exportManifest.json";
import generatedBrushAssets from "./generated/brush-assets.json";

import {
  buildBrushInventoryFromExportManifest,
  summarizeBrushInventory,
  type BrushAssetRecord,
  type BrushInventoryEntry,
  type OpenBrushExportManifest,
} from "./brush-inventory.js";

export const OPEN_BRUSH_DEFAULT_BRUSH_GUID =
  "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62";

export const openBrushInventory = buildBrushInventoryFromExportManifest(
  generatedManifest as unknown as OpenBrushExportManifest,
  generatedBrushAssets.brushes as unknown as Record<string, BrushAssetRecord>,
);

export const openBrushInventorySummary =
  summarizeBrushInventory(openBrushInventory);

export const selectableOpenBrushes = openBrushInventory.filter(
  (entry) => entry.pickerVisible,
);

export const initialOpenBrushIndex = Math.max(
  0,
  selectableOpenBrushes.findIndex(
    (entry) => entry.guid === OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  ),
);

export function resolveSelectableBrushIndex(
  brushGuid: string,
  fallbackIndex = initialOpenBrushIndex,
): number {
  const index = selectableOpenBrushes.findIndex((entry) => entry.guid === brushGuid);
  return index >= 0 ? index : fallbackIndex;
}

export function cycleSelectableBrush(
  currentBrushGuid: string,
  offset: number,
): BrushInventoryEntry {
  const index = resolveSelectableBrushIndex(currentBrushGuid);
  const nextIndex =
    (index + offset + selectableOpenBrushes.length) % selectableOpenBrushes.length;
  return selectableOpenBrushes[nextIndex];
}

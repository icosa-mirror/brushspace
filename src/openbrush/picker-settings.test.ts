import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  openBrushInventory,
  selectableOpenBrushes,
} from "./brush-catalog.js";
import {
  brushSize01ToLiveBrushSize,
  liveBrushSizeToSize01,
} from "./brush-size.js";
import {
  type OpenBrushPickerToolSpec,
  resolveOpenBrushPickerToolSpec,
} from "./tools.js";
import {
  resolveOpenBrushPickerBrushSettings,
  type OpenBrushBrushSettingsSnapshot,
  type OpenBrushPickedStrokeSnapshot,
} from "./picker-settings.js";
import type { Rgba } from "./types.js";

describe("Open Brush picker settings", () => {
  it("copies color only for Color Picker", () => {
    const next = resolveOpenBrushPickerBrushSettings(
      pickerSpec("color-picker"),
      currentSettings(),
      pickedStroke(),
      openBrushInventory,
    );

    expect(next.color).toEqual(pickedColor);
    expect(next.brushGuid).toBe(currentBrush.guid);
    expect(next.size01).toBe(currentSize01);
    expect(next.size).toBe(currentSize);
  });

  it("copies brush only for Brush Picker and keeps normalized size intent", () => {
    const next = resolveOpenBrushPickerBrushSettings(
      pickerSpec("brush-picker"),
      currentSettings(),
      pickedStroke(),
      openBrushInventory,
    );

    expect(next.color).toEqual(currentColor);
    expect(next.brushGuid).toBe(pickedBrush.guid);
    expect(next.size01).toBe(currentSize01);
    expect(next.size).toBeCloseTo(
      brushSize01ToLiveBrushSize(currentSize01, pickedBrush.brushSizeRange),
    );
    expect(next.size).not.toBe(pickedSize);
  });

  it("normalizes current size intent when Brush Picker changes brushes", () => {
    const next = resolveOpenBrushPickerBrushSettings(
      pickerSpec("brush-picker"),
      {
        ...currentSettings(),
        size01: 1.5,
        size: 999,
      },
      pickedStroke(),
      openBrushInventory,
    );

    expect(next.color).toEqual(currentColor);
    expect(next.brushGuid).toBe(pickedBrush.guid);
    expect(next.size01).toBe(1);
    expect(next.size).toBeCloseTo(
      brushSize01ToLiveBrushSize(1, pickedBrush.brushSizeRange),
    );
  });

  it("copies color, brush, and absolute size for Dropper", () => {
    const next = resolveOpenBrushPickerBrushSettings(
      pickerSpec("dropper"),
      currentSettings(),
      pickedStroke(),
      openBrushInventory,
    );

    const expectedSize01 = liveBrushSizeToSize01(
      pickedSize,
      pickedBrush.brushSizeRange,
    );
    expect(next.color).toEqual(pickedColor);
    expect(next.brushGuid).toBe(pickedBrush.guid);
    expect(next.size01).toBeCloseTo(expectedSize01);
    expect(next.size).toBeCloseTo(
      brushSize01ToLiveBrushSize(expectedSize01, pickedBrush.brushSizeRange),
    );
  });
});

const currentBrush = getCurrentBrush();
const pickedBrush = getPickedBrush();
const currentSize01 = 0.25;
const currentSize = brushSize01ToLiveBrushSize(
  currentSize01,
  currentBrush.brushSizeRange,
);
const pickedSize = brushSize01ToLiveBrushSize(0.7, pickedBrush.brushSizeRange);
const currentColor: Rgba = [0.1, 0.2, 0.3, 1];
const pickedColor: Rgba = [0.8, 0.7, 0.6, 0.5];

function currentSettings(): OpenBrushBrushSettingsSnapshot {
  return {
    brushGuid: currentBrush.guid,
    size01: currentSize01,
    size: currentSize,
    color: copyColor(currentColor),
  };
}

function pickedStroke(): OpenBrushPickedStrokeSnapshot {
  return {
    brushGuid: pickedBrush.guid,
    brushSize: pickedSize,
    color: copyColor(pickedColor),
  };
}

function copyColor(color: Rgba): Rgba {
  return [color[0], color[1], color[2], color[3]];
}

function pickerSpec(toolId: string): OpenBrushPickerToolSpec {
  const spec = resolveOpenBrushPickerToolSpec(toolId);
  if (!spec) {
    throw new Error(`Expected picker spec for ${toolId}`);
  }
  return spec;
}

function getCurrentBrush() {
  const brush = selectableOpenBrushes.find(
    (entry) => entry.guid === OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  );
  if (!brush) {
    throw new Error("Expected the upstream Light brush to be selectable.");
  }
  return brush;
}

function getPickedBrush() {
  const brush = selectableOpenBrushes.find(
    (entry) => entry.guid !== OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  );
  if (!brush) {
    throw new Error("Expected at least two selectable brushes.");
  }
  return brush;
}

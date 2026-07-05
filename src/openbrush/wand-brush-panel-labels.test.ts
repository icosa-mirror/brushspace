import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  selectableOpenBrushes,
} from "./brush-catalog.js";
import { resolveWandBrushPanelLabels } from "./wand-brush-panel-labels.js";

describe("Phase A wand brush panel labels", () => {
  it("labels paint sizing as brush size controls", () => {
    const labels = resolveWandBrushPanelLabels(baseInput());

    expect(labels.wandBrushName).toBe(lightBrush.name);
    expect(labels.wandBrushMeta).toBe(
      `${lightBrush.geometryFamily} / ${lightBrushIndex + 1}/${selectableOpenBrushes.length}`,
    );
    expect(labels.wandBrushSize).toBe("Size 50% | 2.4 mm");
    expect(labels.sizeDown).toBe("Size -");
    expect(labels.sizeUp).toBe("Size +");
  });

  it("labels eraser sizing as radius controls", () => {
    const labels = resolveWandBrushPanelLabels(
      baseInput({
        eraserActive: true,
        eraserRadius: 0.2,
      }),
    );

    expect(labels.wandBrushName).toBe("Eraser");
    expect(labels.wandBrushMeta).toBe("contact radius");
    expect(labels.wandBrushSize).toBe("Radius 50% | 0.200 m");
    expect(labels.sizeDown).toBe("Radius -");
    expect(labels.sizeUp).toBe("Radius +");
    expect(labels.activeBrushMeta).toContain("radius 50% | 0.200 m");
  });

  it("keeps panel-focus wording visible for paint and eraser modes", () => {
    expect(
      resolveWandBrushPanelLabels(
        baseInput({
          panelFocusBlocked: true,
        }),
      ).wandBrushMeta,
    ).toBe(`${lightBrush.geometryFamily} / panel focus`);
    expect(
      resolveWandBrushPanelLabels(
        baseInput({
          eraserActive: true,
          panelFocusBlocked: true,
        }),
      ).wandBrushMeta,
    ).toBe("panel focus");
  });

  it("falls back without leaking invalid size text", () => {
    const labels = resolveWandBrushPanelLabels(
      baseInput({
        brushSize01: Number.NaN,
        brushSize: undefined,
      }),
    );

    expect(labels.wandBrushSize).toBe("Size 50% | 2.4 mm");
    expect(labels.wandBrushSize).not.toContain("NaN");
  });
});

const lightBrush = getLightBrush();
const lightBrushIndex = lightBrush ? selectableOpenBrushes.indexOf(lightBrush) : 0;

function baseInput(
  overrides: Partial<Parameters<typeof resolveWandBrushPanelLabels>[0]> = {},
): Parameters<typeof resolveWandBrushPanelLabels>[0] {
  return {
    activeBrush: lightBrush,
    activeBrushIndex: lightBrushIndex,
    brushCount: selectableOpenBrushes.length,
    brushSize01: 0.5,
    brushSize: 0.002353189280256629,
    eraserRadius: 0.2,
    eraserActive: false,
    panelFocusBlocked: false,
    ...overrides,
  };
}

function getLightBrush() {
  const brush = selectableOpenBrushes.find(
    (entry) => entry.guid === OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  );
  if (!brush) {
    throw new Error("Expected the upstream Light brush to be selectable.");
  }
  return brush;
}

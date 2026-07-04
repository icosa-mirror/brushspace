import { describe, expect, it } from "vitest";

import {
  resolveLastSelectableStroke,
  summarizeStrokeSelection,
  type RuntimeStrokeSelectionState,
} from "./selection.js";

const strokes: RuntimeStrokeSelectionState[] = [
  {
    layerIndex: 0,
    commandIndex: 1,
    visible: true,
    renderVisible: true,
    finalized: true,
    selected: false,
  },
  {
    layerIndex: 0,
    commandIndex: 2,
    visible: true,
    renderVisible: false,
    finalized: true,
    selected: false,
  },
  {
    layerIndex: 0,
    commandIndex: 3,
    visible: true,
    renderVisible: true,
    finalized: false,
    selected: false,
  },
  {
    layerIndex: 2,
    commandIndex: 4,
    visible: true,
    renderVisible: true,
    finalized: true,
    selected: false,
  },
];

describe("Open Brush stroke selection", () => {
  it("selects the newest visible finalized stroke on the active layer", () => {
    expect(resolveLastSelectableStroke(strokes, 0)?.commandIndex).toBe(1);
    expect(resolveLastSelectableStroke(strokes, 2)?.commandIndex).toBe(4);
  });

  it("ignores layers without selectable strokes", () => {
    expect(resolveLastSelectableStroke(strokes, 7)).toBeUndefined();
  });

  it("summarizes selected strokes without mutating layer metadata", () => {
    expect(
      summarizeStrokeSelection([
        { ...strokes[0], selected: true },
        { ...strokes[3], selected: false },
      ]),
    ).toEqual({
      selectedStrokeCount: 1,
      activeSelectionLayerIndex: 0,
      lastSelectedStrokeCommandIndex: 1,
    });
  });

  it("uses a mixed-layer sentinel for cross-layer selections", () => {
    expect(
      summarizeStrokeSelection([
        { ...strokes[0], selected: true },
        { ...strokes[3], selected: true },
      ]),
    ).toEqual({
      selectedStrokeCount: 2,
      activeSelectionLayerIndex: -1,
      lastSelectedStrokeCommandIndex: 4,
    });
  });
});

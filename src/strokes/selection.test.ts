import { describe, expect, it } from "vitest";

import {
  planSelectedStrokeTranslation,
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

  it("plans selected stroke translations without mutating source positions", () => {
    const transforms = [
      {
        commandIndex: 3,
        selected: true,
        position: [0.4, 1, -0.2] as [number, number, number],
      },
      {
        commandIndex: 1,
        selected: false,
        position: [2, 2, 2] as [number, number, number],
      },
      {
        commandIndex: 2,
        selected: true,
        position: [-0.1, 0.5, -1] as [number, number, number],
      },
    ];

    expect(planSelectedStrokeTranslation(transforms, [0.1, 0, -0.2])).toEqual([
      {
        commandIndex: 2,
        position: [0, 0.5, -1.2],
      },
      {
        commandIndex: 3,
        position: [0.5, 1, -0.4],
      },
    ]);
    expect(transforms[0].position).toEqual([0.4, 1, -0.2]);
  });
});

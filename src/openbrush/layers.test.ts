import { describe, expect, it } from "vitest";

import {
  createNextLayerState,
  cycleLayerIndex,
  getNextLayerIndex,
  reorderLayerStates,
  summarizeRuntimeLayers,
  type RuntimeLayerState,
} from "./layers.js";

const baseLayers: RuntimeLayerState[] = [
  {
    layerIndex: 0,
    order: 0,
    layerName: "Sketch",
    visible: true,
    locked: false,
    selectionCanvas: false,
    active: true,
  },
  {
    layerIndex: 1,
    order: 0,
    layerName: "Selection",
    visible: true,
    locked: false,
    selectionCanvas: true,
    active: false,
  },
];

describe("Open Brush runtime layers", () => {
  it("allocates new paint layers after selection canvas ids", () => {
    expect(getNextLayerIndex(baseLayers)).toBe(2);
    expect(createNextLayerState(baseLayers)).toEqual({
      layerIndex: 2,
      order: 1,
      layerName: "Layer 2",
      visible: true,
      locked: false,
      selectionCanvas: false,
      active: true,
    });
  });

  it("cycles only through paint layers", () => {
    const layers = [
      ...baseLayers,
      createNextLayerState(baseLayers),
      {
        layerIndex: 3,
        order: 2,
        layerName: "Layer 3",
        visible: true,
        locked: false,
        selectionCanvas: false,
        active: false,
      },
    ];

    expect(cycleLayerIndex(layers, 0, 1)).toBe(2);
    expect(cycleLayerIndex(layers, 2, 1)).toBe(3);
    expect(cycleLayerIndex(layers, 3, 1)).toBe(0);
    expect(cycleLayerIndex(layers, 0, -1)).toBe(3);
  });

  it("summarizes active layer visibility and lock state", () => {
    const layers: RuntimeLayerState[] = [
      ...baseLayers,
      {
        layerIndex: 2,
        order: 1,
        layerName: "Ink",
        visible: false,
        locked: true,
        selectionCanvas: false,
        active: true,
      },
    ];

    expect(summarizeRuntimeLayers(layers, 2)).toEqual({
      paintLayerCount: 2,
      selectionLayerCount: 1,
      activeLayerIndex: 2,
      activeLayerOrder: 1,
      activeLayerName: "Ink",
      activeLayerVisible: false,
      activeLayerLocked: true,
    });
  });

  it("reorders paint layers without changing durable layer ids", () => {
    const layers: RuntimeLayerState[] = [
      ...baseLayers,
      createNextLayerState(baseLayers),
      {
        layerIndex: 3,
        order: 2,
        layerName: "Layer 3",
        visible: true,
        locked: false,
        selectionCanvas: false,
        active: false,
      },
    ];

    const reordered = reorderLayerStates(layers, 3, -1);

    expect(reordered.map((layer) => [layer.layerIndex, layer.order])).toEqual([
      [0, 0],
      [1, 0],
      [2, 2],
      [3, 1],
    ]);
    expect(reordered.find((layer) => layer.layerIndex === 3)?.layerName).toBe(
      "Layer 3",
    );
  });
});

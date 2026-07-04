import { createComponent, Types } from "@iwsdk/core";

export const OpenBrushAppState = createComponent("OpenBrushAppState", {
  mode: { type: Types.String, default: "ready" },
  activeTool: { type: Types.String, default: "free-paint" },
  activeLayerIndex: { type: Types.Int32, default: 0 },
  isDirty: { type: Types.Boolean, default: false },
  commandRevision: { type: Types.Int32, default: 0 },
});

export const BrushSettings = createComponent("BrushSettings", {
  brushGuid: { type: Types.String, default: "" },
  size: { type: Types.Float32, default: 0.42 },
  color: { type: Types.Color, default: [0.1, 0.45, 0.95, 1] },
});

export const CanvasLayer = createComponent("CanvasLayer", {
  layerIndex: { type: Types.Int32, default: 0 },
  layerName: { type: Types.String, default: "Sketch" },
  visible: { type: Types.Boolean, default: true },
  locked: { type: Types.Boolean, default: false },
  selectionCanvas: { type: Types.Boolean, default: false },
  active: { type: Types.Boolean, default: false },
});

export const BrushPointer = createComponent("BrushPointer", {
  hand: { type: Types.String, default: "right" },
  tool: { type: Types.String, default: "free-paint" },
  isDrawing: { type: Types.Boolean, default: false },
  pressure: { type: Types.Float32, default: 0 },
  sampleCount: { type: Types.Int32, default: 0 },
});

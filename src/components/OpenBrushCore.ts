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

export const InputCommandState = createComponent("InputCommandState", {
  source: { type: Types.String, default: "idle" },
  primaryHand: { type: Types.String, default: "none" },
  paintPressed: { type: Types.Boolean, default: false },
  paintDown: { type: Types.Boolean, default: false },
  paintUp: { type: Types.Boolean, default: false },
  alternatePressed: { type: Types.Boolean, default: false },
  alternateDown: { type: Types.Boolean, default: false },
  alternateUp: { type: Types.Boolean, default: false },
  undoDown: { type: Types.Boolean, default: false },
  redoDown: { type: Types.Boolean, default: false },
  pressure: { type: Types.Float32, default: 0 },
  pointerX: { type: Types.Float32, default: 0 },
  pointerY: { type: Types.Float32, default: 0 },
  leftControllerConnected: { type: Types.Boolean, default: false },
  rightControllerConnected: { type: Types.Boolean, default: false },
  commandRevision: { type: Types.Int32, default: 0 },
});

export const StrokeHistoryState = createComponent("StrokeHistoryState", {
  undoDepth: { type: Types.Int32, default: 0 },
  redoDepth: { type: Types.Int32, default: 0 },
  totalStrokeCount: { type: Types.Int32, default: 0 },
  activeStrokeControlPoints: { type: Types.Int32, default: 0 },
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

export const BrushStroke = createComponent("BrushStroke", {
  guid: { type: Types.String, default: "" },
  brushGuid: { type: Types.String, default: "" },
  layerIndex: { type: Types.Int32, default: 0 },
  brushSize: { type: Types.Float32, default: 0 },
  color: { type: Types.Color, default: [1, 1, 1, 1] },
  finalized: { type: Types.Boolean, default: false },
  visible: { type: Types.Boolean, default: true },
  controlPointCount: { type: Types.Int32, default: 0 },
  vertexCount: { type: Types.Int32, default: 0 },
  indexCount: { type: Types.Int32, default: 0 },
  commandIndex: { type: Types.Int32, default: 0 },
  minBounds: { type: Types.Vec3, default: [0, 0, 0] },
  maxBounds: { type: Types.Vec3, default: [0, 0, 0] },
});

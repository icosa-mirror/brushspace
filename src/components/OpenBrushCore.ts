import { createComponent, Types } from "@iwsdk/core";

import {
  OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE,
  OPEN_BRUSH_DEFAULT_SIZE01,
} from "../openbrush/brush-size.js";

export const OpenBrushAppState = createComponent("OpenBrushAppState", {
  mode: { type: Types.String, default: "ready" },
  activeTool: { type: Types.String, default: "free-paint" },
  previousTool: { type: Types.String, default: "free-paint" },
  toolStatus: { type: Types.String, default: "draw-ready" },
  toolRevision: { type: Types.Int32, default: 0 },
  activeLayerIndex: { type: Types.Int32, default: 0 },
  isDirty: { type: Types.Boolean, default: false },
  commandRevision: { type: Types.Int32, default: 0 },
});

export const BrushSettings = createComponent("BrushSettings", {
  brushGuid: { type: Types.String, default: "" },
  size01: { type: Types.Float32, default: OPEN_BRUSH_DEFAULT_SIZE01 },
  size: { type: Types.Float32, default: OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE },
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
  brushNextDown: { type: Types.Boolean, default: false },
  brushPreviousDown: { type: Types.Boolean, default: false },
  pressure: { type: Types.Float32, default: 0 },
  pointerX: { type: Types.Float32, default: 0 },
  pointerY: { type: Types.Float32, default: 0 },
  leftControllerConnected: { type: Types.Boolean, default: false },
  rightControllerConnected: { type: Types.Boolean, default: false },
  commandRevision: { type: Types.Int32, default: 0 },
});

export const AudioFeedbackState = createComponent("AudioFeedbackState", {
  enabled: { type: Types.Boolean, default: true },
  eventCount: { type: Types.Int32, default: 0 },
  toolChangeCount: { type: Types.Int32, default: 0 },
  paintStartCount: { type: Types.Int32, default: 0 },
  paintEndCount: { type: Types.Int32, default: 0 },
  lastEvent: { type: Types.String, default: "" },
  lastTool: { type: Types.String, default: "free-paint" },
});

export const StrokeHistoryState = createComponent("StrokeHistoryState", {
  undoDepth: { type: Types.Int32, default: 0 },
  redoDepth: { type: Types.Int32, default: 0 },
  totalStrokeCount: { type: Types.Int32, default: 0 },
  activeStrokeControlPoints: { type: Types.Int32, default: 0 },
});

export const UiCommandHistoryState = createComponent("UiCommandHistoryState", {
  undoDepth: { type: Types.Int32, default: 0 },
  redoDepth: { type: Types.Int32, default: 0 },
  historyRevision: { type: Types.Int32, default: 0 },
  lastCommandName: { type: Types.String, default: "" },
});

export const SettingsState = createComponent("SettingsState", {
  dominantHand: { type: Types.String, default: "right" },
  panelScale: { type: Types.Float32, default: 1 },
  panelDistance: { type: Types.Float32, default: 0.9 },
  panelHeight: { type: Types.Float32, default: 1.15 },
  panelAnchor: { type: Types.String, default: "off-hand" },
  wandPanelRotationSteps: { type: Types.Int32, default: 0 },
  turnMode: { type: Types.String, default: "snap" },
  snapTurnDegrees: { type: Types.Float32, default: 30 },
  continuousTurnDegreesPerSecond: { type: Types.Float32, default: 90 },
  locomotionMode: { type: Types.String, default: "stationary" },
  browserPointerEnabled: { type: Types.Boolean, default: true },
  xrRayEnabled: { type: Types.Boolean, default: true },
  comfortVignetteEnabled: { type: Types.Boolean, default: false },
  helpVisible: { type: Types.Boolean, default: false },
  controllerHintsVisible: { type: Types.Boolean, default: true },
  settingsRevision: { type: Types.Int32, default: 0 },
  lastSettingsCommand: { type: Types.String, default: "" },
  settingsStatus: { type: Types.String, default: "ready" },
});

export const OpenBrushPanelAttachment = createComponent(
  "OpenBrushPanelAttachment",
  {
    role: { type: Types.String, default: "main" },
    mode: { type: Types.String, default: "fallback" },
    anchor: { type: Types.String, default: "off-hand" },
    hand: { type: Types.String, default: "left" },
    status: { type: Types.String, default: "browser" },
    slotIndex: { type: Types.Int32, default: -1 },
    slotAngleDegrees: { type: Types.Float32, default: 0 },
    visible: { type: Types.Boolean, default: true },
    appliedSettingsRevision: { type: Types.Int32, default: -1 },
    appliedRingRotationSteps: { type: Types.Int32, default: 0 },
  },
);

export const PerformanceState = createComponent("PerformanceState", {
  drawCallCount: { type: Types.Int32, default: 0 },
  batchCount: { type: Types.Int32, default: 0 },
  visibleStrokeCount: { type: Types.Int32, default: 0 },
  finalizedStrokeCount: { type: Types.Int32, default: 0 },
  vertexCount: { type: Types.Int32, default: 0 },
  indexCount: { type: Types.Int32, default: 0 },
  bufferUploadBytes: { type: Types.Int32, default: 0 },
  memoryEstimateBytes: { type: Types.Int32, default: 0 },
  materialVariantCount: { type: Types.Int32, default: 0 },
  warning: { type: Types.String, default: "" },
  performanceRevision: { type: Types.Int32, default: 0 },
});

export const PersistenceState = createComponent("PersistenceState", {
  activeSketchId: { type: Types.String, default: "" },
  activeSketchName: { type: Types.String, default: "Untitled Sketch" },
  status: { type: Types.String, default: "idle" },
  error: { type: Types.String, default: "" },
  catalogEntryCount: { type: Types.Int32, default: 0 },
  saveRevision: { type: Types.Int32, default: 0 },
  loadRevision: { type: Types.Int32, default: 0 },
  exportRevision: { type: Types.Int32, default: 0 },
  lastSavedAtMs: { type: Types.Float64, default: 0 },
  lastLoadedAtMs: { type: Types.Float64, default: 0 },
  lastExportedAtMs: { type: Types.Float64, default: 0 },
  lastTiltByteLength: { type: Types.Int32, default: 0 },
  lastThumbnailByteLength: { type: Types.Int32, default: 0 },
  lastLayerCount: { type: Types.Int32, default: 0 },
  lastStrokeCount: { type: Types.Int32, default: 0 },
  lastControlPointCount: { type: Types.Int32, default: 0 },
  isDirty: { type: Types.Boolean, default: false },
});

export const PlaybackState = createComponent("PlaybackState", {
  mode: { type: Types.String, default: "quickload" },
  status: { type: Types.String, default: "idle" },
  cursor: { type: Types.Float32, default: 0 },
  duration: { type: Types.Float32, default: 0 },
  unit: { type: Types.String, default: "none" },
  visibleStrokeCount: { type: Types.Int32, default: 0 },
  newlyVisibleStrokeCount: { type: Types.Int32, default: 0 },
  hiddenStrokeCount: { type: Types.Int32, default: 0 },
  totalStrokeCount: { type: Types.Int32, default: 0 },
  missingBrushCount: { type: Types.Int32, default: 0 },
  revision: { type: Types.Int32, default: 0 },
});

export const SelectionState = createComponent("SelectionState", {
  selectedStrokeCount: { type: Types.Int32, default: 0 },
  activeSelectionLayerIndex: { type: Types.Int32, default: -1 },
  lastSelectedStrokeCommandIndex: { type: Types.Int32, default: 0 },
  selectionRevision: { type: Types.Int32, default: 0 },
});

export const SelectionWidget = createComponent("SelectionWidget", {
  active: { type: Types.Boolean, default: false },
  initialized: { type: Types.Boolean, default: false },
  selectedStrokeCount: { type: Types.Int32, default: 0 },
  lastPosition: { type: Types.Vec3, default: [0, 0, 0] },
});

export const BrushCatalogState = createComponent("BrushCatalogState", {
  activeBrushIndex: { type: Types.Int32, default: 0 },
  brushCount: { type: Types.Int32, default: 0 },
  supportedBrushCount: { type: Types.Int32, default: 0 },
  fallbackBrushCount: { type: Types.Int32, default: 0 },
  unsupportedBrushCount: { type: Types.Int32, default: 0 },
  activeBrushName: { type: Types.String, default: "" },
  activeGeometryFamily: { type: Types.String, default: "ribbon" },
  activeMaterialFamily: { type: Types.String, default: "standard" },
  warning: { type: Types.String, default: "" },
});

export const CanvasLayer = createComponent("CanvasLayer", {
  layerIndex: { type: Types.Int32, default: 0 },
  order: { type: Types.Int32, default: 0 },
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
  toolId: { type: Types.String, default: "free-paint" },
  groupId: { type: Types.Int32, default: 0 },
  groupContinuation: { type: Types.Boolean, default: false },
  geometryFamily: { type: Types.String, default: "ribbon" },
  materialFamily: { type: Types.String, default: "standard" },
  renderWarning: { type: Types.String, default: "" },
  layerIndex: { type: Types.Int32, default: 0 },
  brushSize: { type: Types.Float32, default: 0 },
  color: { type: Types.Color, default: [1, 1, 1, 1] },
  finalized: { type: Types.Boolean, default: false },
  visible: { type: Types.Boolean, default: true },
  renderVisible: { type: Types.Boolean, default: true },
  selected: { type: Types.Boolean, default: false },
  controlPointCount: { type: Types.Int32, default: 0 },
  vertexCount: { type: Types.Int32, default: 0 },
  indexCount: { type: Types.Int32, default: 0 },
  commandIndex: { type: Types.Int32, default: 0 },
  minBounds: { type: Types.Vec3, default: [0, 0, 0] },
  maxBounds: { type: Types.Vec3, default: [0, 0, 0] },
});

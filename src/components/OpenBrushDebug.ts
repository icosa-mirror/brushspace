import { createComponent, Types } from "@iwsdk/core";

export const OpenBrushDebug = createComponent("OpenBrushDebug", {
  phase: { type: Types.String, default: "phase-2" },
  status: { type: Types.String, default: "ecs-shell" },
  planFile: { type: Types.String, default: "OPEN_BRUSH_IWSDK_PORT_PLAN.md" },
  visibilityState: { type: Types.String, default: "unknown" },
  appMode: { type: Types.String, default: "ready" },
  activeTool: { type: Types.String, default: "free-paint" },
  activeBrushGuid: { type: Types.String, default: "" },
  activeLayerIndex: { type: Types.Int32, default: 0 },
  layerCount: { type: Types.Int32, default: 1 },
  strokeCount: { type: Types.Int32, default: 0 },
  controlPointCount: { type: Types.Int32, default: 0 },
  runtimeCanvasCount: { type: Types.Int32, default: 0 },
  runtimePointerCount: { type: Types.Int32, default: 0 },
  brushInventoryTotal: { type: Types.Int32, default: 0 },
  brushInventorySupported: { type: Types.Int32, default: 0 },
  brushInventoryFallback: { type: Types.Int32, default: 0 },
  brushInventoryUnsupported: { type: Types.Int32, default: 0 },
  fixtureMemoryBytes: { type: Types.Int32, default: 0 },
  catalogStatus: { type: Types.String, default: "inventory-not-loaded" },
  parseStatus: { type: Types.String, default: "fixture-not-loaded" },
});

import { createComponent, Types } from "@iwsdk/core";

export const OpenBrushDebug = createComponent("OpenBrushDebug", {
  phase: { type: Types.String, default: "phase-1" },
  status: { type: Types.String, default: "domain-fixtures" },
  planFile: { type: Types.String, default: "OPEN_BRUSH_IWSDK_PORT_PLAN.md" },
  visibilityState: { type: Types.String, default: "unknown" },
  activeBrushGuid: { type: Types.String, default: "" },
  layerCount: { type: Types.Int32, default: 1 },
  strokeCount: { type: Types.Int32, default: 0 },
  controlPointCount: { type: Types.Int32, default: 0 },
  brushInventoryTotal: { type: Types.Int32, default: 0 },
  brushInventorySupported: { type: Types.Int32, default: 0 },
  brushInventoryFallback: { type: Types.Int32, default: 0 },
  brushInventoryUnsupported: { type: Types.Int32, default: 0 },
  fixtureMemoryBytes: { type: Types.Int32, default: 0 },
  catalogStatus: { type: Types.String, default: "inventory-not-loaded" },
  parseStatus: { type: Types.String, default: "fixture-not-loaded" },
});

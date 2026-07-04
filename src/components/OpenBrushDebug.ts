import { createComponent, Types } from "@iwsdk/core";

export const OpenBrushDebug = createComponent("OpenBrushDebug", {
  phase: { type: Types.String, default: "phase-0" },
  status: { type: Types.String, default: "baseline-harness" },
  planFile: { type: Types.String, default: "OPEN_BRUSH_IWSDK_PORT_PLAN.md" },
  visibilityState: { type: Types.String, default: "unknown" },
  activeBrushGuid: { type: Types.String, default: "" },
  layerCount: { type: Types.Int32, default: 1 },
  strokeCount: { type: Types.Int32, default: 0 },
  catalogStatus: { type: Types.String, default: "not-started" },
  parseStatus: { type: Types.String, default: "not-started" },
});

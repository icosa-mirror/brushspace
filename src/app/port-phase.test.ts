import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_PLAN_FILE,
  OPEN_BRUSH_PORT_PHASE,
  OPEN_BRUSH_PORT_STATUS,
} from "./port-phase.js";

describe("Open Brush port phase metadata", () => {
  it("identifies the active Phase 5 brush catalog", () => {
    expect(OPEN_BRUSH_PLAN_FILE).toBe("OPEN_BRUSH_IWSDK_PORT_PLAN.md");
    expect(OPEN_BRUSH_PORT_PHASE).toBe("phase-5");
    expect(OPEN_BRUSH_PORT_STATUS).toBe("brush-catalog");
  });
});

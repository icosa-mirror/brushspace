import { describe, expect, it } from "vitest";

import {
  getNextOpenBrushTool,
  isOpenBrushToolId,
  openBrushTools,
  resolveOpenBrushTool,
} from "./tools.js";

describe("Open Brush tools", () => {
  it("resolves unknown tools to free paint", () => {
    expect(resolveOpenBrushTool("missing").id).toBe("free-paint");
  });

  it("identifies known tool ids", () => {
    expect(isOpenBrushToolId("eraser")).toBe(true);
    expect(isOpenBrushToolId("unknown")).toBe(false);
  });

  it("cycles through the available tool descriptors", () => {
    expect(getNextOpenBrushTool("free-paint", 1).id).toBe("eraser");
    expect(getNextOpenBrushTool("free-paint", -1).id).toBe(
      openBrushTools[openBrushTools.length - 1].id,
    );
  });

  it("marks eraser as a non-painting erase tool", () => {
    const eraser = resolveOpenBrushTool("eraser");
    expect(eraser.paints).toBe(false);
    expect(eraser.erases).toBe(true);
  });

  it("marks pickers as state-only tools", () => {
    for (const toolId of ["color-picker", "brush-picker"]) {
      const picker = resolveOpenBrushTool(toolId);
      expect(picker.status).toBe("picker-pending");
      expect(picker.paints).toBe(false);
      expect(picker.erases).toBe(false);
    }
  });
});

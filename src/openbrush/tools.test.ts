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
    expect(eraser.samplingMode).toBe("none");
  });

  it("marks straightedge as a painting line-sampling tool", () => {
    const straightedge = resolveOpenBrushTool("straightedge");
    expect(straightedge.paints).toBe(true);
    expect(straightedge.erases).toBe(false);
    expect(straightedge.samplingMode).toBe("straightedge");
    expect(straightedge.mirrorMode).toBe("none");
  });

  it("marks mirror as a painting mirrored freehand tool", () => {
    const mirror = resolveOpenBrushTool("mirror");
    expect(mirror.paints).toBe(true);
    expect(mirror.erases).toBe(false);
    expect(mirror.samplingMode).toBe("freehand");
    expect(mirror.mirrorMode).toBe("x");
  });

  it("marks pickers as state-only tools", () => {
    for (const toolId of ["color-picker", "brush-picker"]) {
      const picker = resolveOpenBrushTool(toolId);
      expect(picker.status).toBe("picker-pending");
      expect(picker.paints).toBe(false);
      expect(picker.erases).toBe(false);
      expect(picker.samplingMode).toBe("none");
      expect(picker.mirrorMode).toBe("none");
    }
  });
});

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
    expect(eraser.snapMode).toBe("none");
    expect(eraser.lazyMode).toBe("none");
  });

  it("marks straightedge as a painting line-sampling tool", () => {
    const straightedge = resolveOpenBrushTool("straightedge");
    expect(straightedge.paints).toBe(true);
    expect(straightedge.erases).toBe(false);
    expect(straightedge.samplingMode).toBe("straightedge");
    expect(straightedge.mirrorMode).toBe("none");
    expect(straightedge.snapMode).toBe("none");
    expect(straightedge.lazyMode).toBe("none");
  });

  it("marks mirror as a painting mirrored freehand tool", () => {
    const mirror = resolveOpenBrushTool("mirror");
    expect(mirror.paints).toBe(true);
    expect(mirror.erases).toBe(false);
    expect(mirror.samplingMode).toBe("freehand");
    expect(mirror.mirrorMode).toBe("x");
    expect(mirror.snapMode).toBe("none");
    expect(mirror.lazyMode).toBe("none");
  });

  it("marks grid snap as a painting freehand snap tool", () => {
    const gridSnap = resolveOpenBrushTool("grid-snap");
    expect(gridSnap.paints).toBe(true);
    expect(gridSnap.erases).toBe(false);
    expect(gridSnap.samplingMode).toBe("freehand");
    expect(gridSnap.mirrorMode).toBe("none");
    expect(gridSnap.snapMode).toBe("grid");
    expect(gridSnap.lazyMode).toBe("none");
  });

  it("marks lazy input as a painting freehand smoothing tool", () => {
    const lazyInput = resolveOpenBrushTool("lazy-input");
    expect(lazyInput.paints).toBe(true);
    expect(lazyInput.erases).toBe(false);
    expect(lazyInput.samplingMode).toBe("freehand");
    expect(lazyInput.mirrorMode).toBe("none");
    expect(lazyInput.snapMode).toBe("none");
    expect(lazyInput.lazyMode).toBe("position");
  });

  it("marks tape as a painting bimanual endpoint tool", () => {
    const tape = resolveOpenBrushTool("tape");
    expect(tape.paints).toBe(true);
    expect(tape.erases).toBe(false);
    expect(tape.samplingMode).toBe("tape");
    expect(tape.mirrorMode).toBe("none");
    expect(tape.snapMode).toBe("none");
    expect(tape.lazyMode).toBe("none");
    expect(tape.stencilMode).toBe("none");
  });

  it("marks stencil as a painting projected freehand tool", () => {
    const stencil = resolveOpenBrushTool("stencil");
    expect(stencil.paints).toBe(true);
    expect(stencil.erases).toBe(false);
    expect(stencil.samplingMode).toBe("freehand");
    expect(stencil.mirrorMode).toBe("none");
    expect(stencil.snapMode).toBe("none");
    expect(stencil.lazyMode).toBe("none");
    expect(stencil.stencilMode).toBe("front-plane");
  });

  it("marks pickers as state-only tools", () => {
    for (const toolId of ["color-picker", "brush-picker"]) {
      const picker = resolveOpenBrushTool(toolId);
      expect(picker.status).toBe("picker-pending");
      expect(picker.paints).toBe(false);
      expect(picker.erases).toBe(false);
      expect(picker.samplingMode).toBe("none");
      expect(picker.mirrorMode).toBe("none");
      expect(picker.snapMode).toBe("none");
      expect(picker.lazyMode).toBe("none");
      expect(picker.stencilMode).toBe("none");
    }
  });
});

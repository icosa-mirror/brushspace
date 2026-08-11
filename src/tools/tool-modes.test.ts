import { describe, expect, it } from "vitest";

import {
  isOpenBrushEditingAllowed,
  isStraightEdgeModeActive,
  resolveEffectiveOpenBrushTool,
} from "./tool-modes.js";

describe("tool modes", () => {
  it("keeps free-paint as the effective tool when straight edge is off", () => {
    expect(resolveEffectiveOpenBrushTool("free-paint", false).id).toBe(
      "free-paint",
    );
    expect(isStraightEdgeModeActive("free-paint", false)).toBe(false);
  });

  it("layers straight edge mode onto free-paint", () => {
    expect(resolveEffectiveOpenBrushTool("free-paint", true).id).toBe(
      "straightedge",
    );
    expect(isStraightEdgeModeActive("free-paint", true)).toBe(true);
  });

  it("does not override non-paint tools when straight edge is enabled", () => {
    expect(resolveEffectiveOpenBrushTool("eraser", true).id).toBe("eraser");
    expect(isStraightEdgeModeActive("eraser", true)).toBe(false);
  });

  it("supports legacy straightedge activeTool values", () => {
    expect(resolveEffectiveOpenBrushTool("straightedge", false).id).toBe(
      "straightedge",
    );
    expect(isStraightEdgeModeActive("straightedge", false)).toBe(true);
  });
});

describe("view-only mode", () => {
  it("resolves every editing tool away to the navigation tool", () => {
    for (const toolId of ["free-paint", "eraser", "dropper", "camera"]) {
      expect(
        resolveEffectiveOpenBrushTool(toolId, { viewOnly: true }).id,
      ).toBe("fly");
    }
  });

  it("keeps navigation tools active", () => {
    expect(resolveEffectiveOpenBrushTool("fly", { viewOnly: true }).id).toBe(
      "fly",
    );
  });

  it("outranks the straight edge overlay", () => {
    expect(
      resolveEffectiveOpenBrushTool("free-paint", {
        straightEdgeEnabled: true,
        viewOnly: true,
      }).id,
    ).toBe("fly");
    expect(
      isStraightEdgeModeActive("free-paint", {
        straightEdgeEnabled: true,
        viewOnly: true,
      }),
    ).toBe(false);
  });

  it("gates editing input on the effective tool", () => {
    expect(isOpenBrushEditingAllowed("free-paint", {})).toBe(true);
    expect(isOpenBrushEditingAllowed("free-paint", { viewOnly: true })).toBe(
      false,
    );
    expect(isOpenBrushEditingAllowed("fly", {})).toBe(false);
  });
});

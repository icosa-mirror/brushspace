import { describe, expect, it } from "vitest";

import {
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

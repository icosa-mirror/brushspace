import { describe, expect, it } from "vitest";

import {
  resolveWandPanelThumbstickDirection,
  shouldApplyWandPanelRotation,
} from "./wand-panel-controls.js";

describe("wand panel controls", () => {
  it("classifies horizontal thumbstick deflections with a deadzone", () => {
    expect(resolveWandPanelThumbstickDirection(0)).toBe(0);
    expect(resolveWandPanelThumbstickDirection(0.64)).toBe(0);
    expect(resolveWandPanelThumbstickDirection(-0.64)).toBe(0);
    expect(resolveWandPanelThumbstickDirection(Number.NaN)).toBe(0);

    expect(resolveWandPanelThumbstickDirection(0.65)).toBe(1);
    expect(resolveWandPanelThumbstickDirection(-0.65)).toBe(-1);
  });

  it("applies rotation only when entering a deflected direction", () => {
    expect(shouldApplyWandPanelRotation(0, 1)).toBe(true);
    expect(shouldApplyWandPanelRotation(0, -1)).toBe(true);

    expect(shouldApplyWandPanelRotation(1, 1)).toBe(false);
    expect(shouldApplyWandPanelRotation(-1, -1)).toBe(false);
    expect(shouldApplyWandPanelRotation(1, 0)).toBe(false);
    expect(shouldApplyWandPanelRotation(0, 0)).toBe(false);
  });
});

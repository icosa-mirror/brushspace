import { describe, expect, it } from "vitest";

import wandColorMarkup from "../../ui/wand-color.uikitml?raw";

describe("wand color panel markup", () => {
  it("shows current-color feedback on the hand-attached panel", () => {
    expect(wandColorMarkup).toContain('id="current-color-swatch"');
    expect(wandColorMarkup).toContain("Current");
  });

  it("exposes a compact usable Phase A swatch set", () => {
    for (const colorId of [
      "color-blue",
      "color-red",
      "color-yellow",
      "color-green",
      "color-white",
    ]) {
      expect(wandColorMarkup).toContain(`id="${colorId}"`);
    }
  });
});

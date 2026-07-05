import { describe, expect, it } from "vitest";

import wandColorMarkup from "../../ui/wand-color.uikitml?raw";

describe("wand color panel markup", () => {
  it("shows current-color feedback on the hand-attached panel", () => {
    expect(wandColorMarkup).toContain('id="current-color-swatch"');
    expect(wandColorMarkup).toContain("Current");
  });
});

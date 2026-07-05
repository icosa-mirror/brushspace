import { describe, expect, it } from "vitest";

import wandToolsMarkup from "../../ui/wand-tools.uikitml?raw";

describe("wand tools panel markup", () => {
  it("exposes the Phase A primary tool selectors on the hand-attached panel", () => {
    const toolIds = [
      "tool-draw",
      "tool-line",
      "tool-erase",
      "tool-color-picker",
      "tool-brush-picker",
      "tool-dropper",
    ];

    for (const toolId of toolIds) {
      expect(wandToolsMarkup).toContain(`id="${toolId}"`);
    }
  });

  it("keeps placeholder advanced tools out of the primary Phase A panel", () => {
    const deferredToolIds = [
      "tool-mirror",
      "tool-grid-snap",
      "tool-lazy-input",
      "tool-tape",
      "tool-stencil",
    ];

    for (const toolId of deferredToolIds) {
      expect(wandToolsMarkup).not.toContain(`id="${toolId}"`);
    }
  });

  it("labels eraser as a held tool instead of a one-shot erase command", () => {
    expect(wandToolsMarkup).toContain('id="tool-erase"');
    expect(wandToolsMarkup).toContain(">Eraser</button>");
    expect(wandToolsMarkup).not.toContain("Erase Target");
  });

  it("groups the Phase A panel around paint, sampling, and history", () => {
    expect(wandToolsMarkup).toContain("Paint");
    expect(wandToolsMarkup).toContain("Sample");
    expect(wandToolsMarkup).toContain("History");
  });
});

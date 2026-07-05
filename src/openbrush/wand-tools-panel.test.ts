import { describe, expect, it } from "vitest";

import wandToolsMarkup from "../../ui/wand-tools.uikitml?raw";

describe("wand tools panel markup", () => {
  it("exposes all implemented tool selectors on the hand-attached panel", () => {
    const toolIds = [
      "tool-draw",
      "tool-line",
      "tool-erase",
      "tool-mirror",
      "tool-grid-snap",
      "tool-lazy-input",
      "tool-tape",
      "tool-stencil",
      "tool-color-picker",
      "tool-brush-picker",
      "tool-dropper",
    ];

    for (const toolId of toolIds) {
      expect(wandToolsMarkup).toContain(`id="${toolId}"`);
    }
  });

  it("labels eraser as a held tool instead of a one-shot erase command", () => {
    expect(wandToolsMarkup).toContain(
      '<button id="tool-erase" class="tool-button">Eraser</button>',
    );
    expect(wandToolsMarkup).not.toContain("Erase Target");
  });
});

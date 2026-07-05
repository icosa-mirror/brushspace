import { describe, expect, it } from "vitest";

import { isOpenBrushPanelFocusable } from "./panel-focus.js";

describe("isOpenBrushPanelFocusable", () => {
  const visiblePanel = {
    objectVisible: true,
    attachmentVisible: true,
    maxWidth: 0.35,
    maxHeight: 0.44,
  };

  it("allows visible attached panels with positive dimensions to block tools", () => {
    expect(isOpenBrushPanelFocusable(visiblePanel)).toBe(true);
  });

  it("ignores hidden fallback panels", () => {
    expect(
      isOpenBrushPanelFocusable({
        ...visiblePanel,
        objectVisible: false,
      }),
    ).toBe(false);
    expect(
      isOpenBrushPanelFocusable({
        ...visiblePanel,
        attachmentVisible: false,
      }),
    ).toBe(false);
  });

  it("ignores zero-size and invalid panels", () => {
    for (const panel of [
      { ...visiblePanel, maxWidth: 0 },
      { ...visiblePanel, maxHeight: 0 },
      { ...visiblePanel, maxWidth: Number.NaN },
      { ...visiblePanel, maxHeight: Number.POSITIVE_INFINITY },
    ]) {
      expect(isOpenBrushPanelFocusable(panel)).toBe(false);
    }
  });
});

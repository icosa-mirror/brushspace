import { describe, expect, it } from "vitest";

import { isOpenBrushPanelFocusable } from "./panel-focus.js";

describe("isOpenBrushPanelFocusable", () => {
  it("allows visible panels with a positive attachment size", () => {
    expect(
      isOpenBrushPanelFocusable({
        objectVisible: true,
        attachmentVisible: true,
        maxWidth: 0.42,
        maxHeight: 0.28,
      }),
    ).toBe(true);
  });

  it("skips XR-hidden attachment panels", () => {
    expect(
      isOpenBrushPanelFocusable({
        objectVisible: true,
        attachmentVisible: false,
        maxWidth: 0.42,
        maxHeight: 0.28,
      }),
    ).toBe(false);
  });

  it("skips object-hidden panels", () => {
    expect(
      isOpenBrushPanelFocusable({
        objectVisible: false,
        attachmentVisible: true,
        maxWidth: 0.42,
        maxHeight: 0.28,
      }),
    ).toBe(false);
  });

  it("skips panels without a usable hit area", () => {
    expect(
      isOpenBrushPanelFocusable({
        objectVisible: true,
        attachmentVisible: true,
        maxWidth: 0,
        maxHeight: 0.28,
      }),
    ).toBe(false);
    expect(
      isOpenBrushPanelFocusable({
        objectVisible: true,
        attachmentVisible: true,
        maxWidth: 0.42,
        maxHeight: Number.NaN,
      }),
    ).toBe(false);
  });
});

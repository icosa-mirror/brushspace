import { describe, expect, it } from "vitest";

import { readViewerModeFlags, resolveViewerMode } from "./viewer-mode.js";

describe("viewer mode flags", () => {
  it("reads the view flag under both spellings", () => {
    expect(readViewerModeFlags("?view").forced).toBe(true);
    expect(readViewerModeFlags("?viewonly=1").forced).toBe(true);
    expect(readViewerModeFlags("?brush=light").forced).toBe(false);
  });

  it("reads the collab join code", () => {
    expect(readViewerModeFlags("?join=123456").joining).toBe(true);
    expect(readViewerModeFlags("?join=").joining).toBe(false);
    expect(readViewerModeFlags("").joining).toBe(false);
  });
});

describe("viewer mode resolution", () => {
  it("stays in editing mode when XR is supported", () => {
    expect(
      resolveViewerMode({ forced: false, joining: false, xrSupported: true }),
    ).toEqual({ viewOnly: false, reason: "editing" });
  });

  it("falls back to the viewer when no headset is available", () => {
    expect(
      resolveViewerMode({ forced: false, joining: false, xrSupported: false }),
    ).toEqual({ viewOnly: true, reason: "no-xr-support" });
  });

  it("honours an explicit view flag even with XR support", () => {
    expect(
      resolveViewerMode({ forced: true, joining: false, xrSupported: true }),
    ).toEqual({ viewOnly: true, reason: "forced" });
  });

  it("lets a collab join outrank both the flag and the probe", () => {
    expect(
      resolveViewerMode({ forced: true, joining: true, xrSupported: false }),
    ).toEqual({ viewOnly: false, reason: "collab-join" });
  });
});

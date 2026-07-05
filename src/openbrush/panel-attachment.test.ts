import { describe, expect, it } from "vitest";

import {
  resolveOpenBrushPanelAttachmentPose,
  type OpenBrushPanelAttachmentSettings,
} from "./panel-attachment.js";

describe("Open Brush panel attachment", () => {
  const baseSettings: OpenBrushPanelAttachmentSettings = {
    dominantHand: "right",
    panelAnchor: "off-hand",
    panelScale: 1,
    panelDistance: 0.9,
    panelHeight: 1.15,
  };

  it("attaches the default panel to the off hand in XR", () => {
    const pose = resolveOpenBrushPanelAttachmentPose(baseSettings);

    expect(pose).toMatchObject({
      anchor: "off-hand",
      hand: "left",
      target: "left-ray",
      status: "xr-hand",
      position: [0.12, 0.1, -0.45],
      orientation: [0, 0, 0, 1],
      scale: [0.72, 0.72, 0.72],
    });
  });

  it("swaps the off-hand target when dominant hand changes", () => {
    const pose = resolveOpenBrushPanelAttachmentPose({
      ...baseSettings,
      dominantHand: "left",
    });

    expect(pose.hand).toBe("right");
    expect(pose.target).toBe("right-ray");
    expect(pose.position[0]).toBe(-0.12);
  });

  it("can explicitly attach to the dominant hand", () => {
    const pose = resolveOpenBrushPanelAttachmentPose({
      ...baseSettings,
      panelAnchor: "dominant-hand",
    });

    expect(pose.hand).toBe("right");
    expect(pose.target).toBe("right-ray");
  });

  it("supports a centered headset-relative panel anchor", () => {
    const pose = resolveOpenBrushPanelAttachmentPose({
      ...baseSettings,
      panelAnchor: "center",
      panelScale: 1.2,
      panelDistance: 1.1,
      panelHeight: 1.25,
    });

    expect(pose).toMatchObject({
      hand: "none",
      target: "xr-origin",
      status: "xr-center",
      position: [0, 1.25, -1.1],
      scale: [1.2, 1.2, 1.2],
    });
  });

  it("keeps hand-attached panels within controller reach", () => {
    const pose = resolveOpenBrushPanelAttachmentPose({
      ...baseSettings,
      panelDistance: 1.8,
      panelScale: 1.5,
    });

    expect(pose.position[2]).toBe(-0.72);
    expect(pose.scale).toEqual([1.08, 1.08, 1.08]);
  });
});

import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_FIXED_WAND_PANEL_ROLES,
  advanceWandPanelRotationSteps,
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
      mode: "fallback",
      slotIndex: -1,
      visible: true,
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

  it("places fixed Color, Brush, and Tools panels onto triangular prism faces", () => {
    const colorPose = resolveOpenBrushPanelAttachmentPose(baseSettings, "color");
    const brushPose = resolveOpenBrushPanelAttachmentPose(baseSettings, "brush");
    const toolsPose = resolveOpenBrushPanelAttachmentPose(baseSettings, "tools");

    expect(OPEN_BRUSH_FIXED_WAND_PANEL_ROLES).toEqual([
      "color",
      "brush",
      "tools",
    ]);
    expect(colorPose).toMatchObject({
      role: "color",
      mode: "fixed-ring",
      hand: "left",
      target: "left-ray",
      slotIndex: 0,
      slotAngleDegrees: 0,
    });
    expect(colorPose.position[0]).toBeCloseTo(0.12, 4);
    expect(colorPose.position[1]).toBeCloseTo(0.1, 4);
    expect(colorPose.position[2]).toBeCloseTo(-0.45, 4);
    expect(colorPose.orientation).toEqual([0, 0, 0, 1]);
    expect(colorPose.scale[0]).toBeCloseTo(0.5328, 4);
    expect(colorPose.scale[1]).toBeCloseTo(0.5328, 4);
    expect(colorPose.scale[2]).toBeCloseTo(0.5328, 4);
    expect(brushPose.slotIndex).toBe(1);
    expect(brushPose.slotAngleDegrees).toBe(120);
    expect(brushPose.position[0]).toBeCloseTo(0.3105, 4);
    expect(brushPose.position[1]).toBeCloseTo(0.1, 4);
    expect(brushPose.position[2]).toBeCloseTo(-0.615, 4);
    expect(brushPose.orientation[1]).toBeCloseTo(-0.5, 3);
    expect(brushPose.orientation[3]).toBeCloseTo(0.866, 3);
    expect(toolsPose.slotIndex).toBe(2);
    expect(toolsPose.slotAngleDegrees).toBe(240);
    expect(toolsPose.position[0]).toBeCloseTo(-0.0705, 4);
    expect(toolsPose.position[1]).toBeCloseTo(0.1, 4);
    expect(toolsPose.position[2]).toBeCloseTo(-0.615, 4);
    expect(toolsPose.orientation[1]).toBeCloseTo(0.5, 3);
    expect(toolsPose.orientation[3]).toBeCloseTo(0.866, 3);
  });

  it("mirrors fixed wand prism panel offsets when handedness swaps", () => {
    const pose = resolveOpenBrushPanelAttachmentPose(
      {
        ...baseSettings,
        dominantHand: "left",
      },
      "brush",
    );

    expect(pose.hand).toBe("right");
    expect(pose.target).toBe("right-ray");
    expect(pose.position[0]).toBeCloseTo(-0.3105, 4);
    expect(pose.orientation[1]).toBeCloseTo(0.5, 3);
  });

  it("rotates fixed wand prism panel slots with cached settings steps", () => {
    const colorPose = resolveOpenBrushPanelAttachmentPose(
      {
        ...baseSettings,
        wandPanelRotationSteps: 1,
      },
      "color",
    );
    const toolsPose = resolveOpenBrushPanelAttachmentPose(
      {
        ...baseSettings,
        wandPanelRotationSteps: -1,
      },
      "tools",
    );

    expect(colorPose.slotIndex).toBe(1);
    expect(colorPose.slotAngleDegrees).toBe(120);
    expect(toolsPose.slotIndex).toBe(1);
    expect(toolsPose.slotAngleDegrees).toBe(120);
  });

  it("supports fractional wand panel rotation steps for prism animation", () => {
    const pose = resolveOpenBrushPanelAttachmentPose(
      {
        ...baseSettings,
        wandPanelRotationSteps: 0.5,
      },
      "color",
    );

    expect(pose.slotAngleDegrees).toBe(60);
    expect(pose.position[0]).toBeCloseTo(0.3105, 4);
    expect(pose.position[1]).toBeCloseTo(0.1, 4);
    expect(pose.position[2]).toBeCloseTo(-0.505, 4);
    expect(pose.orientation[1]).toBeCloseTo(-0.2588, 4);
    expect(pose.orientation[3]).toBeCloseTo(0.9659, 4);
  });

  it("advances wand panel rotation along the shortest wrapped path", () => {
    expect(advanceWandPanelRotationSteps(0, 1, 1 / 60, 3)).toBeCloseTo(0.05, 4);
    expect(advanceWandPanelRotationSteps(0.95, 1, 1 / 60, 7.5)).toBe(1);
    expect(advanceWandPanelRotationSteps(2.9, 0, 1 / 60, 7.5)).toBe(3);
    expect(advanceWandPanelRotationSteps(0.1, 2, 1 / 60, 6)).toBeCloseTo(0, 4);
  });
});

import { describe, expect, it } from "vitest";

import {
  applyColorWheelConstraints,
  colorWheelMatchesRgb,
  hslToRgb,
  pickColorWheel,
  pickColorWheelSlider,
  rgbToHsl,
} from "./color-wheel.js";

describe("Open Brush color wheel (HS_L_Polar)", () => {
  it("maps wheel angle to hue with red at +X", () => {
    const right = pickColorWheel(0.3, 0, 0.3);
    expect(right.hit).toBe(true);
    expect(right.hue01).toBeCloseTo(0);
    expect(right.saturation).toBeCloseTo(1);

    const up = pickColorWheel(0, 0.15, 0.3);
    expect(up.hue01).toBeCloseTo(0.25);
    expect(up.saturation).toBeCloseTo(0.5);

    const left = pickColorWheel(-0.3, 0, 0.3);
    expect(left.hue01).toBeCloseTo(0.5);
  });

  it("clamps slightly-outside picks to the rim and rejects far misses", () => {
    const nearRim = pickColorWheel(0.33, 0, 0.3);
    expect(nearRim.hit).toBe(true);
    expect(nearRim.saturation).toBe(1);
    expect(pickColorWheel(0.6, 0, 0.3).hit).toBe(false);
  });

  it("maps slider Y to lightness with bottom = 0 and top = 1", () => {
    expect(pickColorWheelSlider(-0.3, 0.6)).toBeCloseTo(0);
    expect(pickColorWheelSlider(0, 0.6)).toBeCloseTo(0.5);
    expect(pickColorWheelSlider(0.3, 0.6)).toBeCloseTo(1);
    expect(pickColorWheelSlider(0.9, 0.6)).toBe(1);
  });

  it("round trips HSL and RGB", () => {
    const rgb = hslToRgb(0.6, 0.9, 0.53);
    const back = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    expect(back.hue01).toBeCloseTo(0.6, 3);
    expect(back.saturation).toBeCloseTo(0.9, 3);
    expect(back.lightness).toBeCloseTo(0.53, 3);
  });

  it("matches known colors", () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([1, 0, 0, 1]); // pure red
    const white = hslToRgb(0.3, 0.7, 1);
    expect(white[0]).toBeCloseTo(1);
    expect(white[1]).toBeCloseTo(1);
    expect(white[2]).toBeCloseTo(1);
    const gray = rgbToHsl(0.5, 0.5, 0.5, 0.42);
    expect(gray.saturation).toBe(0);
    expect(gray.hue01).toBe(0.42); // fallback hue keeps the cursor stable
  });

  it("applies per-brush luminance and saturation constraints", () => {
    const constrained = applyColorWheelConstraints(
      { hue01: 0.1, saturation: 1, lightness: 0 },
      0.04, // Light's m_ColorLuminanceMin
      0.8,
    );
    expect(constrained.lightness).toBe(0.04);
    expect(constrained.saturation).toBe(0.8);
  });

  it("detects when the wheel state already encodes an RGB color", () => {
    const state = { hue01: 0.6, saturation: 0.9, lightness: 0.53 };
    const rgb = hslToRgb(state.hue01, state.saturation, state.lightness);
    expect(colorWheelMatchesRgb(state, rgb)).toBe(true);
    expect(colorWheelMatchesRgb(state, [1, 0, 0, 1])).toBe(false);
  });
});

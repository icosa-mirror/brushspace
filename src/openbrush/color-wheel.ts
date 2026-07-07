import type { Rgba } from "./types.js";

// Open Brush's default color picker mode is HS_L_Polar
// (ColorPickerUtils.cs): the disk maps hue to angle (red at +X) and
// saturation to radius, and the side slider drives HSL lightness. Brushes can
// constrain the slider via m_ColorLuminanceMin / m_ColorSaturationMax.

export interface ColorWheelState {
  /** Hue in [0, 1); red at 0. */
  hue01: number;
  /** HSL saturation in [0, 1]. */
  saturation: number;
  /** HSL lightness in [0, 1]. */
  lightness: number;
}

export interface ColorWheelPick {
  hit: boolean;
  hue01: number;
  saturation: number;
}

export const COLOR_WHEEL_DEFAULT_STATE: ColorWheelState = {
  hue01: 0.5833,
  saturation: 0.81,
  lightness: 0.525,
};

/**
 * Maps a point on the wheel (local plane units, wheel centered at origin) to
 * hue/saturation. Points slightly outside the rim clamp to full saturation,
 * matching the reference epsilon behavior; farther misses return hit=false.
 */
export function pickColorWheel(
  localX: number,
  localY: number,
  wheelRadius: number,
  edgeTolerance = 0.15,
): ColorWheelPick {
  const radius = Math.hypot(localX, localY) / wheelRadius;
  if (!Number.isFinite(radius) || radius > 1 + edgeTolerance) {
    return { hit: false, hue01: 0, saturation: 0 };
  }
  let hue01 = Math.atan2(localY, localX) / (Math.PI * 2);
  if (hue01 < 0) {
    hue01 += 1;
  }
  return { hit: true, hue01: hue01 % 1, saturation: Math.min(radius, 1) };
}

/** Maps a slider-local Y (centered) to lightness: bottom = 0, top = 1. */
export function pickColorWheelSlider(
  localY: number,
  sliderHeight: number,
): number {
  const normalized = localY / sliderHeight + 0.5;
  return clamp01(normalized);
}

/** ColorPickerUtils.ApplySliderConstraint for HS_L_Polar. */
export function applyColorWheelConstraints(
  state: ColorWheelState,
  luminanceMin = 0,
  saturationMax = 1,
): ColorWheelState {
  return {
    hue01: state.hue01,
    saturation: Math.min(state.saturation, clamp01(saturationMax) || 1),
    lightness: Math.max(state.lightness, clamp01(luminanceMin)),
  };
}

/** Standard HSL → RGB (reference HSLColor semantics; lightness 0.5 = pure hue). */
export function hslToRgb(hue01: number, saturation: number, lightness: number): Rgba {
  const h = ((hue01 % 1) + 1) % 1;
  const s = clamp01(saturation);
  const l = clamp01(lightness);
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const hue6 = h * 6;
  const x = chroma * (1 - Math.abs((hue6 % 2) - 1));
  const m = l - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue6 < 1) {
    r = chroma;
    g = x;
  } else if (hue6 < 2) {
    r = x;
    g = chroma;
  } else if (hue6 < 3) {
    g = chroma;
    b = x;
  } else if (hue6 < 4) {
    g = x;
    b = chroma;
  } else if (hue6 < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }
  return [r + m, g + m, b + m, 1];
}

/**
 * Standard RGB → HSL. When the color is achromatic the hue is undefined; the
 * provided fallback hue keeps the wheel cursor stable.
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
  fallbackHue01 = 0,
): ColorWheelState {
  const red = clamp01(r);
  const green = clamp01(g);
  const blue = clamp01(b);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  if (chroma < 1e-6) {
    return { hue01: fallbackHue01, saturation: 0, lightness };
  }
  const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
  let hue6: number;
  if (max === red) {
    hue6 = ((green - blue) / chroma + 6) % 6;
  } else if (max === green) {
    hue6 = (blue - red) / chroma + 2;
  } else {
    hue6 = (red - green) / chroma + 4;
  }
  return { hue01: hue6 / 6, saturation: clamp01(saturation), lightness };
}

/** True when the wheel state and an RGB color agree within tolerance. */
export function colorWheelMatchesRgb(
  state: ColorWheelState,
  color: Rgba,
  tolerance = 1e-3,
): boolean {
  const rgb = hslToRgb(state.hue01, state.saturation, state.lightness);
  return (
    Math.abs(rgb[0] - color[0]) <= tolerance &&
    Math.abs(rgb[1] - color[1]) <= tolerance &&
    Math.abs(rgb[2] - color[2]) <= tolerance
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

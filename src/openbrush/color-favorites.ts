import type { Rgba } from "./types.js";

export const OPEN_BRUSH_COLOR_FAVORITE_SLOTS = 8;
const MATCH_TOLERANCE = 1e-3;

/**
 * Adds the current color to the saved swatches, like the app's custom color
 * palette "+" button: exact re-adds are ignored, and once the row is full the
 * oldest swatch drops off.
 */
export function addOpenBrushColorFavorite(
  favorites: readonly Rgba[],
  color: Rgba,
  slots = OPEN_BRUSH_COLOR_FAVORITE_SLOTS,
): Rgba[] {
  const next = favorites.map(copyColor);
  if (next.some((existing) => colorsMatch(existing, color))) {
    return next;
  }
  next.push(copyColor(color));
  while (next.length > slots) {
    next.shift();
  }
  return next;
}

export function colorsMatch(a: Rgba, b: Rgba, tolerance = MATCH_TOLERANCE): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}

/** CSS color for a swatch, converting the linear brush color to sRGB. */
export function colorFavoriteCss(color: Rgba): string {
  return `rgb(${channelToSrgb255(color[0])}, ${channelToSrgb255(color[1])}, ${channelToSrgb255(color[2])})`;
}

function channelToSrgb255(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const srgb =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function copyColor(color: Rgba): Rgba {
  return [color[0], color[1], color[2], color[3]];
}

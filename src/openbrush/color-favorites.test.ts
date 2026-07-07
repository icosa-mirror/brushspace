import { describe, expect, it } from "vitest";

import {
  OPEN_BRUSH_COLOR_FAVORITE_SLOTS,
  addOpenBrushColorFavorite,
  colorFavoriteCss,
  colorsMatch,
} from "./color-favorites.js";
import type { Rgba } from "./types.js";

const red: Rgba = [1, 0, 0, 1];
const green: Rgba = [0, 1, 0, 1];

describe("Open Brush color favorites", () => {
  it("appends new colors and ignores exact re-adds", () => {
    const one = addOpenBrushColorFavorite([], red);
    expect(one).toHaveLength(1);
    const stillOne = addOpenBrushColorFavorite(one, [1, 0, 0, 1]);
    expect(stillOne).toHaveLength(1);
    const two = addOpenBrushColorFavorite(stillOne, green);
    expect(two).toHaveLength(2);
    expect(two[1]).toEqual(green);
  });

  it("drops the oldest swatch once the row is full", () => {
    let favorites: Rgba[] = [];
    for (let index = 0; index < OPEN_BRUSH_COLOR_FAVORITE_SLOTS; index += 1) {
      favorites = addOpenBrushColorFavorite(favorites, [index / 10, 0, 0, 1]);
    }
    expect(favorites).toHaveLength(OPEN_BRUSH_COLOR_FAVORITE_SLOTS);
    const overflowed = addOpenBrushColorFavorite(favorites, green);
    expect(overflowed).toHaveLength(OPEN_BRUSH_COLOR_FAVORITE_SLOTS);
    expect(overflowed[0][0]).toBeCloseTo(0.1);
    expect(overflowed[OPEN_BRUSH_COLOR_FAVORITE_SLOTS - 1]).toEqual(green);
  });

  it("matches colors within tolerance", () => {
    expect(colorsMatch(red, [1, 0.0005, 0, 1])).toBe(true);
    expect(colorsMatch(red, green)).toBe(false);
  });

  it("converts linear channel values to sRGB CSS", () => {
    expect(colorFavoriteCss([1, 1, 1, 1])).toBe("rgb(255, 255, 255)");
    expect(colorFavoriteCss([0, 0, 0, 1])).toBe("rgb(0, 0, 0)");
    // Linear mid-grey lifts above 128 in sRGB.
    const mid = colorFavoriteCss([0.214, 0.214, 0.214, 1]);
    expect(mid).toBe("rgb(127, 127, 127)");
  });
});

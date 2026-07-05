export const OPEN_BRUSH_DEFAULT_SIZE01 = 0.5;
export type BrushSizeRange = readonly [number, number];

export const OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE: BrushSizeRange = [0.05, 3];

// Open Brush stores normalized BrushSize01 in UI state and absolute brushSize on
// strokes. The IWSDK live scale keeps current renderer units usable while range
// metadata is still sourced from Open Brush descriptors.
export const OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE = 0.02;
export const OPEN_BRUSH_IWSDK_BRUSH_SIZE_SCALE =
  OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE /
  brushSize01ToOpenBrushSize(
    OPEN_BRUSH_DEFAULT_SIZE01,
    OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE,
  );

export function normalizeBrushSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) {
    return OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE;
  }
  return size;
}

export function normalizeBrushSize01(size01: number): number {
  if (!Number.isFinite(size01)) {
    return OPEN_BRUSH_DEFAULT_SIZE01;
  }
  if (size01 < 0) {
    return 0;
  }
  if (size01 > 1) {
    return 1;
  }
  return size01;
}

export function normalizeBrushSizeRange(
  range: BrushSizeRange | undefined,
): BrushSizeRange {
  if (!range) {
    return OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE;
  }
  const [min, max] = range;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
    return OPEN_BRUSH_DEFAULT_BRUSH_SIZE_RANGE;
  }
  if (max < min) {
    return [max, min];
  }
  return [min, max];
}

export function brushSize01ToLiveBrushSize(
  size01: number,
  range?: BrushSizeRange,
): number {
  return (
    brushSize01ToOpenBrushSize(size01, normalizeBrushSizeRange(range)) *
    OPEN_BRUSH_IWSDK_BRUSH_SIZE_SCALE
  );
}

export function liveBrushSizeToSize01(
  liveBrushSize: number,
  range?: BrushSizeRange,
): number {
  return openBrushSizeToBrushSize01(
    normalizeBrushSize(liveBrushSize) / OPEN_BRUSH_IWSDK_BRUSH_SIZE_SCALE,
    normalizeBrushSizeRange(range),
  );
}

export function brushSize01ToOpenBrushSize(
  size01: number,
  range?: BrushSizeRange,
): number {
  const [min, max] = normalizeBrushSizeRange(range);
  const minRadius = fromRadius(min);
  const maxRadius = fromRadius(max);
  return toRadius(lerp(minRadius, maxRadius, normalizeBrushSize01(size01)));
}

export function openBrushSizeToBrushSize01(
  brushSize: number,
  range?: BrushSizeRange,
): number {
  const [min, max] = normalizeBrushSizeRange(range);
  const minRadius = fromRadius(min);
  const maxRadius = fromRadius(max);
  if (maxRadius === minRadius) {
    return 0;
  }
  return normalizeBrushSize01(
    (fromRadius(brushSize) - minRadius) / (maxRadius - minRadius),
  );
}

function fromRadius(value: number): number {
  return Math.sqrt(Math.max(value, 0));
}

function toRadius(value: number): number {
  return value * value;
}

function lerp(min: number, max: number, amount: number): number {
  return min + (max - min) * amount;
}

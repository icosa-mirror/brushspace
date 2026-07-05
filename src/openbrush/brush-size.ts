export const OPEN_BRUSH_DEFAULT_SIZE01 = 0.5;

// Temporary live-authoring default until brush asset size ranges are imported.
// Open Brush stores normalized BrushSize01 in UI state and absolute brushSize on
// strokes; this keeps new IWSDK-authored strokes usable without reusing fixture
// stroke widths as defaults.
export const OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE = 0.05;

export function normalizeBrushSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) {
    return OPEN_BRUSH_DEFAULT_LIVE_BRUSH_SIZE;
  }
  return size;
}

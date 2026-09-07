export const FLAT_BATCH_BRUSH_GUID =
  "2d35bcf0-e4d8-452c-97b1-3311be063130";

/** Enabled by default; retain an explicit opt-out for comparison and recovery. */
export function isStrokeBatchingEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get("strokeBatches");
  return value !== "0" && value !== "false";
}

export interface StrokeBatchVisibility {
  privateMeshVisible: boolean;
  subsetVisible: boolean;
}

export type StrokeBatchExtractionTransition = "begin" | "finish" | "none";

/** Computes layer-composed visibility without allocating per-stroke state. */
export function resolveStrokeRenderVisibility(
  strokeVisible: boolean,
  layerVisible: boolean,
): boolean {
  return strokeVisible && layerVisible;
}

/** Guarantees that an extracted stroke and its batch subset never overlap. */
export function resolveStrokeBatchVisibility(
  renderVisible: boolean,
  extracted: boolean,
): StrokeBatchVisibility {
  return extracted
    ? { privateMeshVisible: renderVisible, subsetVisible: false }
    : { privateMeshVisible: false, subsetVisible: renderVisible };
}

/** Returns an extraction operation only when the selection state transitions. */
export function resolveStrokeBatchExtractionTransition(
  selected: boolean,
  batched: boolean,
  extracted: boolean,
): StrokeBatchExtractionTransition {
  if (selected && batched && !extracted) {
    return "begin";
  }
  if (!selected && extracted) {
    return "finish";
  }
  return "none";
}

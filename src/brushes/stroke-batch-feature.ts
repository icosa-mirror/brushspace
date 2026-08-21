export const FLAT_BATCH_BRUSH_GUID =
  "2d35bcf0-e4d8-452c-97b1-3311be063130";

/** Disabled by default; accepts explicit development opt-in values only. */
export function isStrokeBatchingEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get("strokeBatches");
  return value === "1" || value === "true";
}

export interface StrokeBatchVisibility {
  privateMeshVisible: boolean;
  subsetVisible: boolean;
}

export interface StrokeRenderVisibilityChange {
  changed: boolean;
  renderVisible: boolean;
}

/** Computes layer-composed visibility and whether renderer state must change. */
export function resolveStrokeRenderVisibilityChange(
  currentRenderVisible: boolean,
  strokeVisible: boolean,
  layerVisible: boolean,
): StrokeRenderVisibilityChange {
  const renderVisible = strokeVisible && layerVisible;
  return {
    changed: currentRenderVisible !== renderVisible,
    renderVisible,
  };
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

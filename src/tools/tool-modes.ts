import {
  OPEN_BRUSH_VIEW_ONLY_TOOL,
  isOpenBrushToolAllowedInViewOnly,
  resolveOpenBrushTool,
  type OpenBrushToolDescriptor,
} from "./tools.js";

/**
 * Mode overlays that sit on top of the selected tool. Straight edge layers
 * onto free paint; view-only resolves every editing tool away to the
 * navigation tool (SketchControlsScript.EnsureViewOnlyNavigationTool).
 */
export interface OpenBrushToolModes {
  straightEdgeEnabled?: boolean;
  viewOnly?: boolean;
}

export function resolveEffectiveOpenBrushTool(
  activeToolId: string,
  straightEdgeEnabled: boolean | OpenBrushToolModes = false,
  viewOnly = false,
): OpenBrushToolDescriptor {
  const modes: OpenBrushToolModes =
    typeof straightEdgeEnabled === "boolean"
      ? { straightEdgeEnabled, viewOnly }
      : straightEdgeEnabled;
  // View-only outranks every editing overlay: no editing tool survives it.
  if (modes.viewOnly && !isOpenBrushToolAllowedInViewOnly(activeToolId)) {
    return resolveOpenBrushTool(OPEN_BRUSH_VIEW_ONLY_TOOL);
  }
  const activeTool = resolveOpenBrushTool(activeToolId);
  if (activeTool.id === "straightedge") {
    return activeTool;
  }
  if (modes.straightEdgeEnabled && activeTool.id === "free-paint") {
    return resolveOpenBrushTool("straightedge");
  }
  return activeTool;
}

export function isStraightEdgeModeActive(
  activeToolId: string,
  straightEdgeEnabled: boolean | OpenBrushToolModes = false,
  viewOnly = false,
): boolean {
  return (
    resolveEffectiveOpenBrushTool(activeToolId, straightEdgeEnabled, viewOnly)
      .id === "straightedge"
  );
}

/**
 * Whether sketch-mutating input should be accepted right now. The single gate
 * the input layer consults, so view-only never needs per-tool checks.
 */
export function isOpenBrushEditingAllowed(
  activeToolId: string,
  modes: OpenBrushToolModes,
): boolean {
  return resolveEffectiveOpenBrushTool(activeToolId, modes).kind === "editing";
}

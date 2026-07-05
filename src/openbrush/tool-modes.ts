import {
  resolveOpenBrushTool,
  type OpenBrushToolDescriptor,
} from "./tools.js";

export function resolveEffectiveOpenBrushTool(
  activeToolId: string,
  straightEdgeEnabled: boolean,
): OpenBrushToolDescriptor {
  const activeTool = resolveOpenBrushTool(activeToolId);
  if (activeTool.id === "straightedge") {
    return activeTool;
  }
  if (straightEdgeEnabled && activeTool.id === "free-paint") {
    return resolveOpenBrushTool("straightedge");
  }
  return activeTool;
}

export function isStraightEdgeModeActive(
  activeToolId: string,
  straightEdgeEnabled: boolean,
): boolean {
  return resolveEffectiveOpenBrushTool(activeToolId, straightEdgeEnabled).id ===
    "straightedge";
}

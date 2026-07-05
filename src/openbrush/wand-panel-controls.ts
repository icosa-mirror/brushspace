export type WandPanelThumbstickDirection = -1 | 0 | 1;

export const WAND_PANEL_ROTATION_THRESHOLD = 0.65;

export function resolveWandPanelThumbstickDirection(
  axisX: number,
  threshold = WAND_PANEL_ROTATION_THRESHOLD,
): WandPanelThumbstickDirection {
  if (!Number.isFinite(axisX)) {
    return 0;
  }
  if (axisX >= threshold) {
    return 1;
  }
  if (axisX <= -threshold) {
    return -1;
  }
  return 0;
}

export function shouldApplyWandPanelRotation(
  previousDirection: WandPanelThumbstickDirection,
  nextDirection: WandPanelThumbstickDirection,
): boolean {
  return previousDirection === 0 && nextDirection !== 0;
}

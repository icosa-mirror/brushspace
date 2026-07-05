export interface OpenBrushPanelFocusState {
  objectVisible: boolean;
  attachmentVisible: boolean;
  maxWidth: number;
  maxHeight: number;
}

export function isOpenBrushPanelFocusable(
  panel: OpenBrushPanelFocusState,
): boolean {
  return (
    panel.objectVisible &&
    panel.attachmentVisible &&
    Number.isFinite(panel.maxWidth) &&
    Number.isFinite(panel.maxHeight) &&
    panel.maxWidth > 0 &&
    panel.maxHeight > 0
  );
}

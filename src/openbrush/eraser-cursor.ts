import type { Vec3 } from "./types.js";

import { OPEN_BRUSH_ERASER_FORWARD_OFFSET } from "./tools.js";

export function isOpenBrushEraserCursorVisible(
  activeTool: string,
  visibilityState: string,
): boolean {
  return activeTool === "eraser" && visibilityState !== "non-immersive";
}

export function writeOpenBrushEraserCursorLocalPosition(
  target: Vec3,
  forwardOffset = OPEN_BRUSH_ERASER_FORWARD_OFFSET,
): Vec3 {
  target[0] = 0;
  target[1] = 0;
  target[2] = -Math.max(0, forwardOffset);
  return target;
}

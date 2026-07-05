import type { Vec3 } from "./types.js";

import { writeOpenBrushToolLocalForwardOffset } from "./tool-pose.js";
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
  return writeOpenBrushToolLocalForwardOffset(target, forwardOffset);
}

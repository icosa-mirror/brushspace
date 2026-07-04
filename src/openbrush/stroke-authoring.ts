import type { Quat, Vec3 } from "./types.js";

export type StrokeAuthoringPhase = "idle" | "drawing";
export type StrokeAuthoringEvent = "none" | "start" | "sample" | "finalize";

export interface StrokeAuthoringState {
  phase: StrokeAuthoringPhase;
  controlPointCount: number;
  finalizedStrokeCount: number;
}

export interface StrokePointerFrame {
  paintPressed: boolean;
  pressure: number;
  position: Vec3;
  orientation: Quat;
  timestampMs: number;
}

export function createStrokeAuthoringState(): StrokeAuthoringState {
  return {
    phase: "idle",
    controlPointCount: 0,
    finalizedStrokeCount: 0,
  };
}

export function advanceStrokeAuthoringState(
  state: StrokeAuthoringState,
  frame: StrokePointerFrame,
): StrokeAuthoringEvent {
  if (state.phase === "idle") {
    if (!frame.paintPressed) {
      return "none";
    }
    state.phase = "drawing";
    state.controlPointCount = 1;
    return "start";
  }

  if (!frame.paintPressed) {
    state.phase = "idle";
    state.finalizedStrokeCount += 1;
    return "finalize";
  }

  state.controlPointCount += 1;
  return "sample";
}

export function shouldSampleControlPoint(
  previousPosition: Vec3,
  nextPosition: Vec3,
  minDistance: number,
): boolean {
  const dx = nextPosition[0] - previousPosition[0];
  const dy = nextPosition[1] - previousPosition[1];
  const dz = nextPosition[2] - previousPosition[2];
  return dx * dx + dy * dy + dz * dz >= minDistance * minDistance;
}

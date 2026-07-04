import {
  StrokeFlags,
  type ControlPoint,
  type Quat,
  type StrokeData,
  type Vec3,
} from "./types.js";

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

export function writeGridSnappedPosition(
  target: Vec3,
  source: Vec3,
  gridSize: number,
): void {
  if (gridSize <= 0) {
    target[0] = source[0];
    target[1] = source[1];
    target[2] = source[2];
    return;
  }

  target[0] = Math.round(source[0] / gridSize) * gridSize;
  target[1] = Math.round(source[1] / gridSize) * gridSize;
  target[2] = Math.round(source[2] / gridSize) * gridSize;
}

export function writeLazyInputPosition(
  target: Vec3,
  anchor: Vec3,
  source: Vec3,
  radius: number,
): void {
  if (radius <= 0) {
    target[0] = source[0];
    target[1] = source[1];
    target[2] = source[2];
    return;
  }

  const dx = source[0] - anchor[0];
  const dy = source[1] - anchor[1];
  const dz = source[2] - anchor[2];
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance <= radius) {
    target[0] = anchor[0];
    target[1] = anchor[1];
    target[2] = anchor[2];
    return;
  }

  const scale = (distance - radius) / distance;
  target[0] = anchor[0] + dx * scale;
  target[1] = anchor[1] + dy * scale;
  target[2] = anchor[2] + dz * scale;
}

export type StraightedgeSampleResult = "ignored" | "created" | "updated";

export function upsertStraightedgeEndpoint(
  controlPoints: ControlPoint[],
  frame: StrokePointerFrame,
  minDistance: number,
): StraightedgeSampleResult {
  if (controlPoints.length === 0) {
    controlPoints.push(createControlPointFromFrame(frame));
    return "created";
  }

  if (
    !shouldSampleControlPoint(
      controlPoints[0].position,
      frame.position,
      minDistance,
    )
  ) {
    return "ignored";
  }

  if (controlPoints.length === 1) {
    controlPoints.push(createControlPointFromFrame(frame));
    return "created";
  }

  writeControlPointFromFrame(controlPoints[1], frame);
  controlPoints.length = 2;
  return "updated";
}

export function createControlPointFromFrame(
  frame: StrokePointerFrame,
): ControlPoint {
  return {
    position: [frame.position[0], frame.position[1], frame.position[2]],
    orientation: [
      frame.orientation[0],
      frame.orientation[1],
      frame.orientation[2],
      frame.orientation[3],
    ],
    pressure: frame.pressure,
    timestampMs: frame.timestampMs,
  };
}

export function writeControlPointFromFrame(
  controlPoint: ControlPoint,
  frame: StrokePointerFrame,
): void {
  controlPoint.position[0] = frame.position[0];
  controlPoint.position[1] = frame.position[1];
  controlPoint.position[2] = frame.position[2];
  controlPoint.orientation[0] = frame.orientation[0];
  controlPoint.orientation[1] = frame.orientation[1];
  controlPoint.orientation[2] = frame.orientation[2];
  controlPoint.orientation[3] = frame.orientation[3];
  controlPoint.pressure = frame.pressure;
  controlPoint.timestampMs = frame.timestampMs;
}

export function mirrorControlPointX(controlPoint: ControlPoint): ControlPoint {
  return {
    position: [
      -controlPoint.position[0],
      controlPoint.position[1],
      controlPoint.position[2],
    ],
    orientation: [
      controlPoint.orientation[0],
      controlPoint.orientation[1],
      controlPoint.orientation[2],
      controlPoint.orientation[3],
    ],
    pressure: controlPoint.pressure,
    timestampMs: controlPoint.timestampMs,
  };
}

export function createMirroredStrokeDataX(
  source: StrokeData,
  overrides: { guid: string; seed: number; groupId?: number },
): StrokeData {
  return {
    ...source,
    guid: overrides.guid,
    seed: overrides.seed,
    groupId: overrides.groupId ?? source.groupId,
    flags: source.flags | StrokeFlags.IsGroupContinue,
    color: [source.color[0], source.color[1], source.color[2], source.color[3]],
    controlPoints: source.controlPoints.map(mirrorControlPointX),
  };
}

import type { SketchDocument } from "./document.js";
import type { ControlPoint, StrokeData, Vec3 } from "../types.js";

export type SketchPlaybackMode = "quickload" | "timestamp" | "distance";
export type SketchPlaybackUnit = "none" | "ms" | "meters";

export interface SketchPlaybackStroke {
  strokeGuid: string;
  brushGuid: string;
  layerIndex: number;
  order: number;
  revealAt: number;
  startTimestampMs: number;
  endTimestampMs: number;
  distanceMeters: number;
  missingBrush: boolean;
}

export interface SketchPlaybackTimeline {
  mode: SketchPlaybackMode;
  unit: SketchPlaybackUnit;
  duration: number;
  strokeCount: number;
  missingBrushCount: number;
  warnings: string[];
  strokes: SketchPlaybackStroke[];
}

export interface SketchPlaybackState {
  cursor: number;
  complete: boolean;
  revision: number;
  visibleStrokeGuids: string[];
  newlyVisibleStrokeGuids: string[];
  hiddenStrokeGuids: string[];
}

export interface SketchPlaybackTimelineOptions {
  mode?: SketchPlaybackMode;
  hasBrush?: (brushGuid: string) => boolean;
}

export function createSketchPlaybackTimeline(
  document: SketchDocument,
  options: SketchPlaybackTimelineOptions = {},
): SketchPlaybackTimeline {
  const mode = options.mode ?? "quickload";
  const hasBrush = options.hasBrush ?? (() => true);
  const preparedStrokes = document.strokes.map((stroke, order) =>
    preparePlaybackStroke(stroke, order, hasBrush),
  );
  const warnings = preparedStrokes
    .filter((stroke) => stroke.missingBrush)
    .map(
      (stroke) =>
        `Stroke ${stroke.strokeGuid} uses missing brush ${stroke.brushGuid}; fallback material required.`,
    );

  if (mode === "timestamp") {
    return createTimestampTimeline(mode, preparedStrokes, warnings);
  }
  if (mode === "distance") {
    return createDistanceTimeline(mode, preparedStrokes, warnings);
  }
  return {
    mode,
    unit: "none",
    duration: 0,
    strokeCount: preparedStrokes.length,
    missingBrushCount: warnings.length,
    warnings,
    strokes: preparedStrokes.map((stroke) => ({ ...stroke, revealAt: 0 })),
  };
}

export function createSketchPlaybackState(): SketchPlaybackState {
  return {
    cursor: 0,
    complete: false,
    revision: 0,
    visibleStrokeGuids: [],
    newlyVisibleStrokeGuids: [],
    hiddenStrokeGuids: [],
  };
}

export function seekSketchPlayback(
  timeline: SketchPlaybackTimeline,
  cursor: number,
  previousState: SketchPlaybackState = createSketchPlaybackState(),
): SketchPlaybackState {
  const nextCursor =
    timeline.mode === "quickload" ? 0 : clamp(cursor, 0, timeline.duration);
  const previousVisible = new Set(previousState.visibleStrokeGuids);
  const visibleStrokeGuids = timeline.strokes
    .filter((stroke) => stroke.revealAt <= nextCursor)
    .map((stroke) => stroke.strokeGuid);
  const nextVisible = new Set(visibleStrokeGuids);
  const newlyVisibleStrokeGuids = visibleStrokeGuids.filter(
    (strokeGuid) => !previousVisible.has(strokeGuid),
  );
  const hiddenStrokeGuids = previousState.visibleStrokeGuids.filter(
    (strokeGuid) => !nextVisible.has(strokeGuid),
  );

  return {
    cursor: nextCursor,
    complete: timeline.mode === "quickload" || nextCursor >= timeline.duration,
    revision: previousState.revision + 1,
    visibleStrokeGuids,
    newlyVisibleStrokeGuids,
    hiddenStrokeGuids,
  };
}

export function advanceSketchPlayback(
  timeline: SketchPlaybackTimeline,
  previousState: SketchPlaybackState,
  delta: number,
): SketchPlaybackState {
  return seekSketchPlayback(timeline, previousState.cursor + delta, previousState);
}

export function rewindSketchPlayback(
  timeline: SketchPlaybackTimeline,
  previousState: SketchPlaybackState,
): SketchPlaybackState {
  return seekSketchPlayback(timeline, 0, previousState);
}

function preparePlaybackStroke(
  stroke: StrokeData,
  order: number,
  hasBrush: (brushGuid: string) => boolean,
): SketchPlaybackStroke {
  const timestamps = stroke.controlPoints.map((point) => point.timestampMs);
  const startTimestampMs = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const endTimestampMs = timestamps.length > 0 ? Math.max(...timestamps) : 0;
  return {
    strokeGuid: stroke.guid,
    brushGuid: stroke.brushGuid,
    layerIndex: stroke.layerIndex,
    order,
    revealAt: 0,
    startTimestampMs,
    endTimestampMs,
    distanceMeters: getStrokeDistanceMeters(stroke.controlPoints),
    missingBrush: !hasBrush(stroke.brushGuid),
  };
}

function createTimestampTimeline(
  mode: SketchPlaybackMode,
  strokes: SketchPlaybackStroke[],
  warnings: string[],
): SketchPlaybackTimeline {
  const sortedStrokes = [...strokes].sort(
    (left, right) =>
      left.startTimestampMs - right.startTimestampMs || left.order - right.order,
  );
  const firstTimestamp = sortedStrokes[0]?.startTimestampMs ?? 0;
  const duration = sortedStrokes.reduce(
    (maxDuration, stroke) =>
      Math.max(maxDuration, stroke.endTimestampMs - firstTimestamp),
    0,
  );
  return {
    mode,
    unit: "ms",
    duration,
    strokeCount: sortedStrokes.length,
    missingBrushCount: warnings.length,
    warnings,
    strokes: sortedStrokes.map((stroke) => ({
      ...stroke,
      revealAt: Math.max(0, stroke.startTimestampMs - firstTimestamp),
    })),
  };
}

function createDistanceTimeline(
  mode: SketchPlaybackMode,
  strokes: SketchPlaybackStroke[],
  warnings: string[],
): SketchPlaybackTimeline {
  let cursor = 0;
  const distanceStrokes = strokes.map((stroke) => {
    const revealAt = cursor;
    cursor += stroke.distanceMeters;
    return { ...stroke, revealAt };
  });
  return {
    mode,
    unit: "meters",
    duration: cursor,
    strokeCount: distanceStrokes.length,
    missingBrushCount: warnings.length,
    warnings,
    strokes: distanceStrokes,
  };
}

function getStrokeDistanceMeters(controlPoints: ControlPoint[]): number {
  let distance = 0;
  for (let index = 1; index < controlPoints.length; index += 1) {
    distance += getDistance(controlPoints[index - 1].position, controlPoints[index].position);
  }
  return distance;
}

function getDistance(left: Vec3, right: Vec3): number {
  const x = right[0] - left[0];
  const y = right[1] - left[1];
  const z = right[2] - left[2];
  return Math.sqrt(x * x + y * y + z * z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

import type { ControlPoint, Quat, StrokeData, Vec3 } from "./types.js";

/**
 * Two-user collaboration protocol. Transport is a single reliable PeerJS
 * JSON data channel; state is a custom stroke-level protocol rather than a
 * CRDT because the model makes concurrent edits commute already: strokes
 * are immutable and keyed by author-unique GUIDs, and erase/undo/redo all
 * reduce to an idempotent per-stroke visibility boolean.
 *
 * All stroke data and tip poses travel in CANVAS space (the OpenBrushScenePose
 * frame), so each side's own world-grab pose never leaks into shared state.
 */

export const COLLAB_PROTOCOL_VERSION = 2;
/**
 * PeerJS JSON data channels refuse (and KILL the connection on) any message
 * over util.chunkedMTU (~16 KB), so strokes travel as a begin/points/end
 * sequence with the points split into fixed-size chunks. 50 points is ~12 KB
 * of JSON worst-case; a whole stroke can be any length.
 */
export const STROKE_POINTS_PER_MESSAGE = 50;
/** Mass erase/undo can carry hundreds of guids; chunk those too. */
export const VISIBILITY_GUIDS_PER_MESSAGE = 200;
export const COLLAB_PEER_ID_PREFIX = "brushspace-";
export const COLLAB_CODE_LENGTH = 6;

/** Six digits: easy to speak aloud and to enter on the VR keypad. */
export function generateCollabCode(
  random: () => number = Math.random,
): string {
  let code = "";
  for (let index = 0; index < COLLAB_CODE_LENGTH; index += 1) {
    code += Math.floor(random() * 10).toString();
  }
  return code;
}

export function isValidCollabCode(code: string): boolean {
  return new RegExp(`^[0-9]{${COLLAB_CODE_LENGTH}}$`).test(code);
}

/** The host claims this ID at the signaling broker; guests dial it. */
export function collabPeerId(code: string): string {
  return `${COLLAB_PEER_ID_PREFIX}${code}`;
}

export interface CollabHelloMessage {
  t: "hello";
  version: number;
}

/**
 * Announces the initial sync. The strokes themselves stream as
 * begin/points/end sequences (strokeCount of them) so no single wire message
 * outgrows the data channel's message-size ceiling.
 */
export interface CollabSnapshotMessage {
  t: "snapshot";
  version: number;
  sketchName: string;
  strokeCount: number;
}

/**
 * Opens an incremental stroke transfer: carries the stroke metadata with an
 * empty (or seed) point list. `live` strokes re-render on every points chunk
 * (the peer is drawing right now); non-live ones only materialize at
 * stroke-end (committed replay, snapshot sync). Re-announcing a guid resets
 * its assembly, which is how a committed stroke replaces its own live
 * preview.
 */
export interface CollabStrokeBeginMessage {
  t: "stroke-begin";
  stroke: StrokeData;
  live: boolean;
}

/** Appends a chunk of control points to an announced stroke. */
export interface CollabStrokePointsMessage {
  t: "stroke-points";
  guid: string;
  from: number;
  points: ControlPoint[];
}

/** Completes an announced stroke; totalPoints guards against gaps. */
export interface CollabStrokeEndMessage {
  t: "stroke-end";
  guid: string;
  totalPoints: number;
}

/** The in-progress stroke was discarded (e.g. below solid min length). */
export interface CollabStrokeDropMessage {
  t: "stroke-drop";
  guid: string;
}

/** Erase, undo, and redo all reduce to this. */
export interface CollabVisibilityMessage {
  t: "visibility";
  guids: string[];
  visible: boolean;
}

/**
 * Presence beacon: the peer's brush tip pose in canvas space, plus the
 * peer's head pose driving the avatar. `head` is optional so a peer built
 * before avatars simply renders no head.
 */
export interface CollabTipMessage {
  t: "tip";
  position: Vec3;
  orientation: Quat;
  drawing: boolean;
  head?: {
    position: Vec3;
    orientation: Quat;
  };
}

/**
 * Timer-driven keepalive. Sent via setInterval rather than the render loop
 * so it keeps flowing while rAF is paused (headset off, system menu, tab in
 * background) — silence on the wire then reliably means the peer is gone.
 */
export interface CollabPingMessage {
  t: "ping";
}

export interface CollabByeMessage {
  t: "bye";
}

export type CollabMessage =
  | CollabHelloMessage
  | CollabSnapshotMessage
  | CollabStrokeBeginMessage
  | CollabStrokePointsMessage
  | CollabStrokeEndMessage
  | CollabStrokeDropMessage
  | CollabVisibilityMessage
  | CollabTipMessage
  | CollabPingMessage
  | CollabByeMessage;

const MESSAGE_TYPES = new Set([
  "hello",
  "snapshot",
  "stroke-begin",
  "stroke-points",
  "stroke-end",
  "stroke-drop",
  "visibility",
  "tip",
  "ping",
  "bye",
]);

function isFiniteNumberArray(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => Number.isFinite(entry))
  );
}

function isValidControlPoint(point: unknown): point is ControlPoint {
  return (
    !!point &&
    typeof point === "object" &&
    isFiniteNumberArray((point as ControlPoint).position, 3) &&
    isFiniteNumberArray((point as ControlPoint).orientation, 4) &&
    Number.isFinite((point as ControlPoint).pressure) &&
    Number.isFinite((point as ControlPoint).timestampMs)
  );
}

export function isValidStrokeData(value: unknown): value is StrokeData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const stroke = value as StrokeData;
  return (
    typeof stroke.guid === "string" &&
    stroke.guid.length > 0 &&
    typeof stroke.brushGuid === "string" &&
    Number.isFinite(stroke.brushSize) &&
    Number.isFinite(stroke.brushScale) &&
    isFiniteNumberArray(stroke.color, 4) &&
    Array.isArray(stroke.controlPoints) &&
    stroke.controlPoints.every(isValidControlPoint)
  );
}

/** Splits control points into wire-safe chunks (see STROKE_POINTS_PER_MESSAGE). */
export function chunkControlPoints(
  points: readonly ControlPoint[],
  chunkSize: number = STROKE_POINTS_PER_MESSAGE,
): ControlPoint[][] {
  const chunks: ControlPoint[][] = [];
  for (let start = 0; start < points.length; start += chunkSize) {
    chunks.push(points.slice(start, start + chunkSize));
  }
  return chunks;
}

/**
 * Validates an incoming wire value. Returns undefined for anything that is
 * not a well-formed message — the connection stays up; bad frames drop.
 */
export function parseCollabMessage(raw: unknown): CollabMessage | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const message = raw as CollabMessage;
  if (!MESSAGE_TYPES.has(message.t)) {
    return undefined;
  }
  switch (message.t) {
    case "hello":
      return Number.isFinite(message.version) ? message : undefined;
    case "snapshot":
      return Number.isFinite(message.version) &&
        typeof message.sketchName === "string" &&
        Number.isFinite(message.strokeCount)
        ? message
        : undefined;
    case "stroke-begin":
      return isValidStrokeData(message.stroke) &&
        typeof message.live === "boolean"
        ? message
        : undefined;
    case "stroke-points":
      return typeof message.guid === "string" &&
        message.guid.length > 0 &&
        Number.isInteger(message.from) &&
        message.from >= 0 &&
        Array.isArray(message.points) &&
        message.points.length > 0 &&
        message.points.every(isValidControlPoint)
        ? message
        : undefined;
    case "stroke-end":
      return typeof message.guid === "string" &&
        message.guid.length > 0 &&
        Number.isInteger(message.totalPoints) &&
        message.totalPoints >= 0
        ? message
        : undefined;
    case "stroke-drop":
      return typeof message.guid === "string" && message.guid.length > 0
        ? message
        : undefined;
    case "visibility":
      return Array.isArray(message.guids) &&
        message.guids.every(
          (guid) => typeof guid === "string" && guid.length > 0,
        ) &&
        typeof message.visible === "boolean"
        ? message
        : undefined;
    case "tip":
      return isFiniteNumberArray(message.position, 3) &&
        isFiniteNumberArray(message.orientation, 4) &&
        typeof message.drawing === "boolean" &&
        (message.head === undefined ||
          (isFiniteNumberArray(message.head.position, 3) &&
            isFiniteNumberArray(message.head.orientation, 4)))
        ? message
        : undefined;
    case "ping":
    case "bye":
      return message;
  }
}

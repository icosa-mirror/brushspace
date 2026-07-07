import type { Quat, StrokeData, Vec3 } from "./types.js";

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

export const COLLAB_PROTOCOL_VERSION = 1;
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
 * Announces the initial sync. The strokes themselves stream as individual
 * stroke-end messages (strokeCount of them) so no single frame outgrows the
 * data channel's message-size ceiling.
 */
export interface CollabSnapshotMessage {
  t: "snapshot";
  version: number;
  sketchName: string;
  strokeCount: number;
}

/**
 * Whole-stroke progress for the sender's single in-progress stroke. Sending
 * the full stroke each time (throttled) keeps the receiver self-healing: a
 * lost or reordered update is corrected by the next one.
 */
export interface CollabStrokeProgressMessage {
  t: "stroke-progress";
  stroke: StrokeData;
}

export interface CollabStrokeEndMessage {
  t: "stroke-end";
  stroke: StrokeData;
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

/** Presence beacon: the peer's brush tip pose in canvas space. */
export interface CollabTipMessage {
  t: "tip";
  position: Vec3;
  orientation: Quat;
  drawing: boolean;
}

export interface CollabByeMessage {
  t: "bye";
}

export type CollabMessage =
  | CollabHelloMessage
  | CollabSnapshotMessage
  | CollabStrokeProgressMessage
  | CollabStrokeEndMessage
  | CollabStrokeDropMessage
  | CollabVisibilityMessage
  | CollabTipMessage
  | CollabByeMessage;

const MESSAGE_TYPES = new Set([
  "hello",
  "snapshot",
  "stroke-progress",
  "stroke-end",
  "stroke-drop",
  "visibility",
  "tip",
  "bye",
]);

function isFiniteNumberArray(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => Number.isFinite(entry))
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
    stroke.controlPoints.every(
      (point) =>
        point &&
        typeof point === "object" &&
        isFiniteNumberArray(point.position, 3) &&
        isFiniteNumberArray(point.orientation, 4) &&
        Number.isFinite(point.pressure) &&
        Number.isFinite(point.timestampMs),
    )
  );
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
    case "stroke-progress":
    case "stroke-end":
      return isValidStrokeData(message.stroke) ? message : undefined;
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
        typeof message.drawing === "boolean"
        ? message
        : undefined;
    case "bye":
      return message;
  }
}

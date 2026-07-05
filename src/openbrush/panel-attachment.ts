import type {
  OpenBrushDominantHand,
  OpenBrushPanelAnchor,
} from "./settings.js";

export type OpenBrushPanelAttachmentTarget =
  | "xr-origin"
  | "left-ray"
  | "right-ray";
export type OpenBrushPanelRole = "main" | "color" | "brush" | "tools";
export type OpenBrushPanelMode = "fallback" | "fixed-ring";
export type OpenBrushPanelAttachmentStatus =
  | "browser"
  | "browser-hidden"
  | "xr-center"
  | "xr-hand"
  | "xr-hidden";

export const OPEN_BRUSH_FIXED_WAND_PANEL_ROLES = [
  "color",
  "brush",
  "tools",
] as const satisfies readonly OpenBrushPanelRole[];

export interface OpenBrushPanelAttachmentSettings {
  dominantHand: string;
  panelAnchor: string;
  panelScale: number;
  panelDistance: number;
  panelHeight: number;
  wandPanelRotationSteps?: number;
}

export interface OpenBrushPanelAttachmentPose {
  role: OpenBrushPanelRole;
  mode: OpenBrushPanelMode;
  anchor: OpenBrushPanelAnchor;
  hand: OpenBrushDominantHand | "none";
  target: OpenBrushPanelAttachmentTarget;
  status: OpenBrushPanelAttachmentStatus;
  slotIndex: number;
  slotAngleDegrees: number;
  visible: boolean;
  position: readonly [number, number, number];
  orientation: readonly [number, number, number, number];
  scale: readonly [number, number, number];
}

export interface MutableOpenBrushPanelAttachmentPose {
  role: OpenBrushPanelRole;
  mode: OpenBrushPanelMode;
  anchor: OpenBrushPanelAnchor;
  hand: OpenBrushDominantHand | "none";
  target: OpenBrushPanelAttachmentTarget;
  status: OpenBrushPanelAttachmentStatus;
  slotIndex: number;
  slotAngleDegrees: number;
  visible: boolean;
  position: [number, number, number];
  orientation: [number, number, number, number];
  scale: [number, number, number];
}

const HAND_PANEL_DISTANCE_SCALE = 0.5;
const HAND_PANEL_DISTANCE_MIN = 0.28;
const HAND_PANEL_DISTANCE_MAX = 0.72;
const HAND_PANEL_VERTICAL_OFFSET = 0.1;
const HAND_PANEL_INWARD_OFFSET = 0.12;
const HAND_PANEL_SCALE = 0.72;
const FIXED_PRISM_FACE_RADIUS = 0.22;
const FIXED_PRISM_FACE_DEPTH = 0.11;
const FIXED_PRISM_PANEL_SCALE = 0.74;
const FIXED_PRISM_SLOT_DEGREES = 120;
export const WAND_PANEL_ROTATION_STEPS_PER_SECOND = 4;
const DEFAULT_PANEL_DISTANCE = 0.9;
const DEFAULT_PANEL_HEIGHT = 1.15;
const DEFAULT_PANEL_SCALE = 1;

export function resolveOpenBrushPanelAttachmentPose(
  settings: OpenBrushPanelAttachmentSettings,
  role: OpenBrushPanelRole = "main",
): OpenBrushPanelAttachmentPose {
  return resolveOpenBrushPanelAttachmentPoseInto(
    settings,
    role,
    createOpenBrushPanelAttachmentPose(),
  );
}

export function createOpenBrushPanelAttachmentPose(): MutableOpenBrushPanelAttachmentPose {
  return {
    role: "main",
    mode: "fallback",
    anchor: "off-hand",
    hand: "left",
    target: "left-ray",
    status: "xr-hand",
    slotIndex: -1,
    slotAngleDegrees: 0,
    visible: true,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

export function resolveOpenBrushPanelAttachmentPoseInto(
  settings: OpenBrushPanelAttachmentSettings,
  roleOrOut: OpenBrushPanelRole | MutableOpenBrushPanelAttachmentPose,
  maybeOut?: MutableOpenBrushPanelAttachmentPose,
): MutableOpenBrushPanelAttachmentPose {
  const role = typeof roleOrOut === "string" ? roleOrOut : "main";
  const out = typeof roleOrOut === "string" ? maybeOut : roleOrOut;
  if (!out) {
    throw new Error(
      "resolveOpenBrushPanelAttachmentPoseInto requires an output pose",
    );
  }

  resolveBaseOpenBrushPanelAttachmentPoseInto(settings, role, out);
  if (isFixedWandPanelRole(role)) {
    applyFixedWandPanelSlot(settings, role, out);
  }
  return out;
}

function resolveBaseOpenBrushPanelAttachmentPoseInto(
  settings: OpenBrushPanelAttachmentSettings,
  role: OpenBrushPanelRole,
  out: MutableOpenBrushPanelAttachmentPose,
): MutableOpenBrushPanelAttachmentPose {
  const anchor = normalizePanelAnchor(settings.panelAnchor);
  const dominantHand = normalizeDominantHand(settings.dominantHand);
  const panelScale = normalizePositive(settings.panelScale, DEFAULT_PANEL_SCALE);
  const panelDistance = normalizePositive(
    settings.panelDistance,
    DEFAULT_PANEL_DISTANCE,
  );
  const panelHeight = normalizePositive(settings.panelHeight, DEFAULT_PANEL_HEIGHT);

  if (anchor === "center") {
    out.role = role;
    out.mode = isFixedWandPanelRole(role) ? "fixed-ring" : "fallback";
    out.anchor = anchor;
    out.hand = "none";
    out.target = "xr-origin";
    out.status = "xr-center";
    out.slotIndex = -1;
    out.slotAngleDegrees = 0;
    out.visible = true;
    out.position[0] = 0;
    out.position[1] = panelHeight;
    out.position[2] = -panelDistance;
    out.orientation[0] = 0;
    out.orientation[1] = 0;
    out.orientation[2] = 0;
    out.orientation[3] = 1;
    out.scale[0] = panelScale;
    out.scale[1] = panelScale;
    out.scale[2] = panelScale;
    return out;
  }

  const hand =
    anchor === "dominant-hand" ? dominantHand : getOppositeHand(dominantHand);
  const handDistance = clamp(
    panelDistance * HAND_PANEL_DISTANCE_SCALE,
    HAND_PANEL_DISTANCE_MIN,
    HAND_PANEL_DISTANCE_MAX,
  );
  const inwardOffset =
    hand === "left" ? HAND_PANEL_INWARD_OFFSET : -HAND_PANEL_INWARD_OFFSET;
  const handScale = panelScale * HAND_PANEL_SCALE;

  out.role = role;
  out.mode = isFixedWandPanelRole(role) ? "fixed-ring" : "fallback";
  out.anchor = anchor;
  out.hand = hand;
  out.target = hand === "left" ? "left-ray" : "right-ray";
  out.status = "xr-hand";
  out.slotIndex = -1;
  out.slotAngleDegrees = 0;
  out.visible = true;
  out.position[0] = inwardOffset;
  out.position[1] = HAND_PANEL_VERTICAL_OFFSET;
  out.position[2] = -handDistance;
  out.orientation[0] = 0;
  out.orientation[1] = 0;
  out.orientation[2] = 0;
  out.orientation[3] = 1;
  out.scale[0] = handScale;
  out.scale[1] = handScale;
  out.scale[2] = handScale;
  return out;
}

function applyFixedWandPanelSlot(
  settings: OpenBrushPanelAttachmentSettings,
  role: OpenBrushPanelRole,
  out: MutableOpenBrushPanelAttachmentPose,
): void {
  const baseIndex = OPEN_BRUSH_FIXED_WAND_PANEL_ROLES.indexOf(
    role as (typeof OPEN_BRUSH_FIXED_WAND_PANEL_ROLES)[number],
  );
  const continuousSlot = baseIndex + (settings.wandPanelRotationSteps ?? 0);
  const slotIndex = wrapSlotIndex(Math.round(continuousSlot));
  const slotAngleDegrees = normalizeSlotAngleDegrees(
    continuousSlot * FIXED_PRISM_SLOT_DEGREES,
  );
  const angle = (slotAngleDegrees * Math.PI) / 180;
  const signedAngle =
    slotAngleDegrees > 180
      ? ((slotAngleDegrees - 360) * Math.PI) / 180
      : angle;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const mirror = out.hand === "right" ? -1 : 1;
  const yaw = -signedAngle * 0.5 * mirror;
  const halfYaw = yaw * 0.5;

  out.mode = "fixed-ring";
  out.slotIndex = slotIndex;
  out.slotAngleDegrees = slotAngleDegrees;
  out.position[0] += sin * FIXED_PRISM_FACE_RADIUS * mirror;
  out.position[2] -= (1 - cos) * FIXED_PRISM_FACE_DEPTH;
  out.orientation[0] = 0;
  out.orientation[1] = normalizeSignedZero(Math.sin(halfYaw));
  out.orientation[2] = 0;
  out.orientation[3] = normalizeSignedZero(Math.cos(halfYaw));
  out.scale[0] *= FIXED_PRISM_PANEL_SCALE;
  out.scale[1] *= FIXED_PRISM_PANEL_SCALE;
  out.scale[2] *= FIXED_PRISM_PANEL_SCALE;
}

function isFixedWandPanelRole(role: OpenBrushPanelRole): boolean {
  return OPEN_BRUSH_FIXED_WAND_PANEL_ROLES.includes(
    role as (typeof OPEN_BRUSH_FIXED_WAND_PANEL_ROLES)[number],
  );
}

function wrapSlotIndex(value: number): number {
  const slotCount = OPEN_BRUSH_FIXED_WAND_PANEL_ROLES.length;
  return ((value % slotCount) + slotCount) % slotCount;
}

export function advanceWandPanelRotationSteps(
  currentSteps: number,
  targetSteps: number,
  deltaSeconds: number,
  stepsPerSecond = WAND_PANEL_ROTATION_STEPS_PER_SECOND,
): number {
  if (!Number.isFinite(targetSteps)) {
    return Number.isFinite(currentSteps) ? currentSteps : 0;
  }
  if (!Number.isFinite(currentSteps)) {
    return targetSteps;
  }
  const slotCount = OPEN_BRUSH_FIXED_WAND_PANEL_ROLES.length;
  const nearestTarget =
    targetSteps +
    Math.round((currentSteps - targetSteps) / slotCount) * slotCount;
  const delta = nearestTarget - currentSteps;
  const maxStep =
    Math.max(0, Math.min(deltaSeconds, 0.2)) *
    Math.max(0, stepsPerSecond);
  if (maxStep <= 0) {
    return currentSteps;
  }
  if (Math.abs(delta) <= maxStep) {
    return nearestTarget;
  }
  return currentSteps + Math.sign(delta) * maxStep;
}

function normalizeSlotAngleDegrees(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeDominantHand(value: string): OpenBrushDominantHand {
  return value === "left" ? "left" : "right";
}

function normalizePanelAnchor(value: string): OpenBrushPanelAnchor {
  return value === "dominant-hand" || value === "center" ? value : "off-hand";
}

function getOppositeHand(hand: OpenBrushDominantHand): OpenBrushDominantHand {
  return hand === "left" ? "right" : "left";
}

function normalizePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

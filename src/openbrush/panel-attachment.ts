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
const FIXED_RING_RADIUS = 0.24;
const FIXED_RING_PANEL_SCALE = 0.68;
const FIXED_RING_SLOT_DEGREES = 120;
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
  const slotIndex = wrapSlotIndex(
    baseIndex + Math.floor(settings.wandPanelRotationSteps ?? 0),
  );
  const slotAngleDegrees = slotIndex * FIXED_RING_SLOT_DEGREES;
  const angle = (slotAngleDegrees * Math.PI) / 180;
  const mirror = out.hand === "right" ? -1 : 1;

  out.mode = "fixed-ring";
  out.slotIndex = slotIndex;
  out.slotAngleDegrees = slotAngleDegrees;
  out.position[0] += Math.sin(angle) * FIXED_RING_RADIUS * mirror;
  out.position[1] += Math.cos(angle) * FIXED_RING_RADIUS;
  out.scale[0] *= FIXED_RING_PANEL_SCALE;
  out.scale[1] *= FIXED_RING_PANEL_SCALE;
  out.scale[2] *= FIXED_RING_PANEL_SCALE;
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

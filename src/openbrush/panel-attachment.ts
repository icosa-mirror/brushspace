import type {
  OpenBrushDominantHand,
  OpenBrushPanelAnchor,
} from "./settings.js";

export type OpenBrushPanelAttachmentTarget =
  | "xr-origin"
  | "left-ray"
  | "right-ray";

export interface OpenBrushPanelAttachmentSettings {
  dominantHand: string;
  panelAnchor: string;
  panelScale: number;
  panelDistance: number;
  panelHeight: number;
}

export interface OpenBrushPanelAttachmentPose {
  anchor: OpenBrushPanelAnchor;
  hand: OpenBrushDominantHand | "none";
  target: OpenBrushPanelAttachmentTarget;
  status: "xr-center" | "xr-hand";
  position: readonly [number, number, number];
  orientation: readonly [number, number, number, number];
  scale: readonly [number, number, number];
}

export interface MutableOpenBrushPanelAttachmentPose {
  anchor: OpenBrushPanelAnchor;
  hand: OpenBrushDominantHand | "none";
  target: OpenBrushPanelAttachmentTarget;
  status: "xr-center" | "xr-hand";
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
const DEFAULT_PANEL_DISTANCE = 0.9;
const DEFAULT_PANEL_HEIGHT = 1.15;
const DEFAULT_PANEL_SCALE = 1;

export function resolveOpenBrushPanelAttachmentPose(
  settings: OpenBrushPanelAttachmentSettings,
): OpenBrushPanelAttachmentPose {
  return resolveOpenBrushPanelAttachmentPoseInto(
    settings,
    createOpenBrushPanelAttachmentPose(),
  );
}

export function createOpenBrushPanelAttachmentPose(): MutableOpenBrushPanelAttachmentPose {
  return {
    anchor: "off-hand",
    hand: "left",
    target: "left-ray",
    status: "xr-hand",
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  };
}

export function resolveOpenBrushPanelAttachmentPoseInto(
  settings: OpenBrushPanelAttachmentSettings,
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
    out.anchor = anchor;
    out.hand = "none";
    out.target = "xr-origin";
    out.status = "xr-center";
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

  out.anchor = anchor;
  out.hand = hand;
  out.target = hand === "left" ? "left-ray" : "right-ray";
  out.status = "xr-hand";
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

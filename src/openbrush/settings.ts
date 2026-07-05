export type OpenBrushDominantHand = "left" | "right";
export type OpenBrushPanelAnchor = "off-hand" | "dominant-hand" | "center";
export type OpenBrushTurnMode = "off" | "snap" | "continuous";
export type OpenBrushLocomotionMode = "stationary" | "smooth";

export interface OpenBrushSettings {
  dominantHand: OpenBrushDominantHand;
  panelScale: number;
  panelDistance: number;
  panelHeight: number;
  panelAnchor: OpenBrushPanelAnchor;
  wandPanelRotationSteps: number;
  turnMode: OpenBrushTurnMode;
  snapTurnDegrees: number;
  continuousTurnDegreesPerSecond: number;
  locomotionMode: OpenBrushLocomotionMode;
  browserPointerEnabled: boolean;
  xrRayEnabled: boolean;
  comfortVignetteEnabled: boolean;
  helpVisible: boolean;
  controllerHintsVisible: boolean;
  settingsRevision: number;
  lastSettingsCommand: string;
  settingsStatus: string;
}

export type OpenBrushSettingsCommand =
  | { type: "toggle-dominant-hand" }
  | { type: "set-dominant-hand"; hand: OpenBrushDominantHand }
  | { type: "set-panel-scale"; scale: number }
  | { type: "nudge-panel-scale"; delta: number }
  | { type: "set-panel-distance"; distance: number }
  | { type: "nudge-panel-distance"; delta: number }
  | { type: "set-panel-height"; height: number }
  | { type: "set-panel-anchor"; anchor: OpenBrushPanelAnchor }
  | { type: "set-wand-panel-rotation"; steps: number }
  | { type: "rotate-wand-panel-ring"; direction?: 1 | -1 }
  | { type: "set-turn-mode"; mode: OpenBrushTurnMode }
  | { type: "cycle-turn-mode"; direction?: 1 | -1 }
  | { type: "set-snap-turn-degrees"; degrees: number }
  | { type: "set-continuous-turn-speed"; degreesPerSecond: number }
  | { type: "set-locomotion-mode"; mode: OpenBrushLocomotionMode }
  | { type: "set-browser-pointer-enabled"; enabled: boolean }
  | { type: "set-xr-ray-enabled"; enabled: boolean }
  | { type: "set-comfort-vignette-enabled"; enabled: boolean }
  | { type: "set-help-visible"; visible: boolean }
  | { type: "toggle-help" }
  | { type: "set-controller-hints-visible"; visible: boolean };

export interface OpenBrushSettingsCommandResult {
  settings: OpenBrushSettings;
  changed: boolean;
  commandName: string;
  status: "applied" | "unchanged";
}

export interface OpenBrushSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const OPEN_BRUSH_SETTINGS_VERSION = 1;
export const OPEN_BRUSH_SETTINGS_STORAGE_KEY = "open-brush-iwsdk-settings:v1";

export const OPEN_BRUSH_SETTINGS_LIMITS = {
  panelScaleMin: 0.65,
  panelScaleMax: 1.6,
  panelDistanceMin: 0.45,
  panelDistanceMax: 1.8,
  panelHeightMin: 0.75,
  panelHeightMax: 1.7,
  snapTurnDegreesMin: 15,
  snapTurnDegreesMax: 90,
  continuousTurnDegreesPerSecondMin: 30,
  continuousTurnDegreesPerSecondMax: 180,
} as const;

const defaultOpenBrushSettings: OpenBrushSettings = {
  dominantHand: "right",
  panelScale: 1,
  panelDistance: 0.9,
  panelHeight: 1.15,
  panelAnchor: "off-hand",
  wandPanelRotationSteps: 0,
  turnMode: "snap",
  snapTurnDegrees: 30,
  continuousTurnDegreesPerSecond: 90,
  locomotionMode: "stationary",
  browserPointerEnabled: true,
  xrRayEnabled: true,
  comfortVignetteEnabled: false,
  helpVisible: false,
  controllerHintsVisible: true,
  settingsRevision: 0,
  lastSettingsCommand: "",
  settingsStatus: "ready",
};

const turnModeOrder: readonly OpenBrushTurnMode[] = [
  "off",
  "snap",
  "continuous",
];

export function createDefaultOpenBrushSettings(): OpenBrushSettings {
  return { ...defaultOpenBrushSettings };
}

export function normalizeOpenBrushSettings(
  input: Partial<OpenBrushSettings> | unknown,
): OpenBrushSettings {
  const defaults = defaultOpenBrushSettings;
  const record = isRecord(input) ? input : {};
  return {
    dominantHand: pickEnum(
      record.dominantHand,
      ["left", "right"],
      defaults.dominantHand,
    ),
    panelScale: clampFinite(
      record.panelScale,
      defaults.panelScale,
      OPEN_BRUSH_SETTINGS_LIMITS.panelScaleMin,
      OPEN_BRUSH_SETTINGS_LIMITS.panelScaleMax,
    ),
    panelDistance: clampFinite(
      record.panelDistance,
      defaults.panelDistance,
      OPEN_BRUSH_SETTINGS_LIMITS.panelDistanceMin,
      OPEN_BRUSH_SETTINGS_LIMITS.panelDistanceMax,
    ),
    panelHeight: clampFinite(
      record.panelHeight,
      defaults.panelHeight,
      OPEN_BRUSH_SETTINGS_LIMITS.panelHeightMin,
      OPEN_BRUSH_SETTINGS_LIMITS.panelHeightMax,
    ),
    panelAnchor: pickEnum(
      record.panelAnchor,
      ["off-hand", "dominant-hand", "center"],
      defaults.panelAnchor,
    ),
    wandPanelRotationSteps: Math.floor(
      pickFinite(record.wandPanelRotationSteps, defaults.wandPanelRotationSteps),
    ),
    turnMode: pickEnum(
      record.turnMode,
      ["off", "snap", "continuous"],
      defaults.turnMode,
    ),
    snapTurnDegrees: clampFinite(
      record.snapTurnDegrees,
      defaults.snapTurnDegrees,
      OPEN_BRUSH_SETTINGS_LIMITS.snapTurnDegreesMin,
      OPEN_BRUSH_SETTINGS_LIMITS.snapTurnDegreesMax,
    ),
    continuousTurnDegreesPerSecond: clampFinite(
      record.continuousTurnDegreesPerSecond,
      defaults.continuousTurnDegreesPerSecond,
      OPEN_BRUSH_SETTINGS_LIMITS.continuousTurnDegreesPerSecondMin,
      OPEN_BRUSH_SETTINGS_LIMITS.continuousTurnDegreesPerSecondMax,
    ),
    locomotionMode: pickEnum(
      record.locomotionMode,
      ["stationary", "smooth"],
      defaults.locomotionMode,
    ),
    browserPointerEnabled: pickBoolean(
      record.browserPointerEnabled,
      defaults.browserPointerEnabled,
    ),
    xrRayEnabled: pickBoolean(record.xrRayEnabled, defaults.xrRayEnabled),
    comfortVignetteEnabled: pickBoolean(
      record.comfortVignetteEnabled,
      defaults.comfortVignetteEnabled,
    ),
    helpVisible: pickBoolean(record.helpVisible, defaults.helpVisible),
    controllerHintsVisible: pickBoolean(
      record.controllerHintsVisible,
      defaults.controllerHintsVisible,
    ),
    settingsRevision: Math.max(
      0,
      Math.floor(pickFinite(record.settingsRevision, defaults.settingsRevision)),
    ),
    lastSettingsCommand: pickString(
      record.lastSettingsCommand,
      defaults.lastSettingsCommand,
    ),
    settingsStatus: pickString(record.settingsStatus, defaults.settingsStatus),
  };
}

export function serializeOpenBrushSettings(settings: OpenBrushSettings): string {
  return JSON.stringify({
    version: OPEN_BRUSH_SETTINGS_VERSION,
    settings: normalizeOpenBrushSettings(settings),
  });
}

export function parseOpenBrushSettings(serialized: string | null): OpenBrushSettings {
  if (!serialized) {
    return createDefaultOpenBrushSettings();
  }
  try {
    const payload = JSON.parse(serialized) as unknown;
    if (isRecord(payload) && isRecord(payload.settings)) {
      return normalizeOpenBrushSettings(payload.settings);
    }
    return normalizeOpenBrushSettings(payload);
  } catch {
    return createDefaultOpenBrushSettings();
  }
}

export function resolveOpenBrushSettingsCommand(
  current: Partial<OpenBrushSettings> | unknown,
  command: OpenBrushSettingsCommand,
): OpenBrushSettingsCommandResult {
  const before = normalizeOpenBrushSettings(current);
  const next = { ...before };
  const commandName = command.type;

  switch (command.type) {
    case "toggle-dominant-hand":
      next.dominantHand = before.dominantHand === "right" ? "left" : "right";
      break;
    case "set-dominant-hand":
      next.dominantHand = command.hand;
      break;
    case "set-panel-scale":
      next.panelScale = command.scale;
      break;
    case "nudge-panel-scale":
      next.panelScale = before.panelScale + command.delta;
      break;
    case "set-panel-distance":
      next.panelDistance = command.distance;
      break;
    case "nudge-panel-distance":
      next.panelDistance = before.panelDistance + command.delta;
      break;
    case "set-panel-height":
      next.panelHeight = command.height;
      break;
    case "set-panel-anchor":
      next.panelAnchor = command.anchor;
      break;
    case "set-wand-panel-rotation":
      next.wandPanelRotationSteps = command.steps;
      break;
    case "rotate-wand-panel-ring":
      next.wandPanelRotationSteps =
        before.wandPanelRotationSteps + (command.direction ?? 1);
      break;
    case "set-turn-mode":
      next.turnMode = command.mode;
      break;
    case "cycle-turn-mode":
      next.turnMode = cycleTurnMode(before.turnMode, command.direction ?? 1);
      break;
    case "set-snap-turn-degrees":
      next.snapTurnDegrees = command.degrees;
      break;
    case "set-continuous-turn-speed":
      next.continuousTurnDegreesPerSecond = command.degreesPerSecond;
      break;
    case "set-locomotion-mode":
      next.locomotionMode = command.mode;
      break;
    case "set-browser-pointer-enabled":
      next.browserPointerEnabled = command.enabled;
      break;
    case "set-xr-ray-enabled":
      next.xrRayEnabled = command.enabled;
      break;
    case "set-comfort-vignette-enabled":
      next.comfortVignetteEnabled = command.enabled;
      break;
    case "set-help-visible":
      next.helpVisible = command.visible;
      break;
    case "toggle-help":
      next.helpVisible = !before.helpVisible;
      break;
    case "set-controller-hints-visible":
      next.controllerHintsVisible = command.visible;
      break;
  }

  const normalized = normalizeOpenBrushSettings(next);
  const changed = !areSettingsBehaviorEqual(before, normalized);
  if (!changed) {
    return {
      settings: before,
      changed: false,
      commandName,
      status: "unchanged",
    };
  }

  return {
    settings: {
      ...normalized,
      settingsRevision: before.settingsRevision + 1,
      lastSettingsCommand: commandName,
      settingsStatus: "applied",
    },
    changed: true,
    commandName,
    status: "applied",
  };
}

export class OpenBrushSettingsStore {
  constructor(
    private readonly storage: OpenBrushSettingsStorage,
    private readonly key = OPEN_BRUSH_SETTINGS_STORAGE_KEY,
  ) {}

  load(): OpenBrushSettings {
    return parseOpenBrushSettings(this.storage.getItem(this.key));
  }

  save(settings: OpenBrushSettings): OpenBrushSettings {
    const normalized = normalizeOpenBrushSettings(settings);
    this.storage.setItem(this.key, serializeOpenBrushSettings(normalized));
    return normalized;
  }

  reset(): OpenBrushSettings {
    this.storage.removeItem(this.key);
    return createDefaultOpenBrushSettings();
  }
}

export class MemoryOpenBrushSettingsStorage
  implements OpenBrushSettingsStorage
{
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function cycleTurnMode(
  current: OpenBrushTurnMode,
  direction: 1 | -1,
): OpenBrushTurnMode {
  const index = turnModeOrder.indexOf(current);
  const nextIndex =
    (index + direction + turnModeOrder.length) % turnModeOrder.length;
  return turnModeOrder[nextIndex];
}

function areSettingsBehaviorEqual(
  left: OpenBrushSettings,
  right: OpenBrushSettings,
): boolean {
  return (
    left.dominantHand === right.dominantHand &&
    left.panelScale === right.panelScale &&
    left.panelDistance === right.panelDistance &&
    left.panelHeight === right.panelHeight &&
    left.panelAnchor === right.panelAnchor &&
    left.wandPanelRotationSteps === right.wandPanelRotationSteps &&
    left.turnMode === right.turnMode &&
    left.snapTurnDegrees === right.snapTurnDegrees &&
    left.continuousTurnDegreesPerSecond ===
      right.continuousTurnDegreesPerSecond &&
    left.locomotionMode === right.locomotionMode &&
    left.browserPointerEnabled === right.browserPointerEnabled &&
    left.xrRayEnabled === right.xrRayEnabled &&
    left.comfortVignetteEnabled === right.comfortVignetteEnabled &&
    left.helpVisible === right.helpVisible &&
    left.controllerHintsVisible === right.controllerHintsVisible
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickEnum<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && choices.includes(value as T)
    ? (value as T)
    : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function pickFinite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampFinite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, pickFinite(value, fallback)));
}

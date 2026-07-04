import { describe, expect, it } from "vitest";

import {
  MemoryOpenBrushSettingsStorage,
  OPEN_BRUSH_SETTINGS_LIMITS,
  OPEN_BRUSH_SETTINGS_STORAGE_KEY,
  OpenBrushSettingsStore,
  createDefaultOpenBrushSettings,
  normalizeOpenBrushSettings,
  parseOpenBrushSettings,
  resolveOpenBrushSettingsCommand,
  serializeOpenBrushSettings,
} from "./settings.js";

describe("Open Brush settings", () => {
  it("normalizes malformed persisted values with comfort-safe defaults", () => {
    const settings = normalizeOpenBrushSettings({
      dominantHand: "ambidextrous",
      panelScale: 8,
      panelDistance: 0.1,
      panelHeight: Number.NaN,
      panelAnchor: "off-hand",
      turnMode: "smooth",
      snapTurnDegrees: 180,
      continuousTurnDegreesPerSecond: 5,
      locomotionMode: "teleport",
      browserPointerEnabled: "yes",
      xrRayEnabled: false,
      comfortVignetteEnabled: true,
      helpVisible: true,
      controllerHintsVisible: false,
      settingsRevision: 4.9,
    });

    expect(settings).toMatchObject({
      dominantHand: "right",
      panelScale: OPEN_BRUSH_SETTINGS_LIMITS.panelScaleMax,
      panelDistance: OPEN_BRUSH_SETTINGS_LIMITS.panelDistanceMin,
      panelHeight: 1.15,
      panelAnchor: "off-hand",
      turnMode: "snap",
      snapTurnDegrees: OPEN_BRUSH_SETTINGS_LIMITS.snapTurnDegreesMax,
      continuousTurnDegreesPerSecond:
        OPEN_BRUSH_SETTINGS_LIMITS.continuousTurnDegreesPerSecondMin,
      locomotionMode: "stationary",
      browserPointerEnabled: true,
      xrRayEnabled: false,
      comfortVignetteEnabled: true,
      helpVisible: true,
      controllerHintsVisible: false,
      settingsRevision: 4,
    });
  });

  it("round trips versioned storage payloads", () => {
    const original = {
      ...createDefaultOpenBrushSettings(),
      dominantHand: "left" as const,
      panelScale: 1.25,
      settingsRevision: 2,
    };

    const restored = parseOpenBrushSettings(serializeOpenBrushSettings(original));

    expect(restored).toEqual(original);
  });

  it("uses defaults when persisted data is missing or invalid", () => {
    expect(parseOpenBrushSettings(null)).toEqual(createDefaultOpenBrushSettings());
    expect(parseOpenBrushSettings("{")).toEqual(createDefaultOpenBrushSettings());
  });

  it("applies command routing and revisions only when behavior changes", () => {
    const initial = createDefaultOpenBrushSettings();

    const toggled = resolveOpenBrushSettingsCommand(initial, {
      type: "toggle-dominant-hand",
    });
    expect(toggled.changed).toBe(true);
    expect(toggled.settings.dominantHand).toBe("left");
    expect(toggled.settings.settingsRevision).toBe(1);
    expect(toggled.settings.lastSettingsCommand).toBe("toggle-dominant-hand");
    expect(toggled.settings.settingsStatus).toBe("applied");

    const unchanged = resolveOpenBrushSettingsCommand(toggled.settings, {
      type: "set-dominant-hand",
      hand: "left",
    });
    expect(unchanged.changed).toBe(false);
    expect(unchanged.settings).toEqual(toggled.settings);
    expect(unchanged.settings.settingsRevision).toBe(1);
  });

  it("cycles and clamps comfort controls through commands", () => {
    let settings = createDefaultOpenBrushSettings();

    settings = resolveOpenBrushSettingsCommand(settings, {
      type: "cycle-turn-mode",
      direction: 1,
    }).settings;
    expect(settings.turnMode).toBe("continuous");

    settings = resolveOpenBrushSettingsCommand(settings, {
      type: "nudge-panel-scale",
      delta: 10,
    }).settings;
    expect(settings.panelScale).toBe(OPEN_BRUSH_SETTINGS_LIMITS.panelScaleMax);

    settings = resolveOpenBrushSettingsCommand(settings, {
      type: "set-panel-distance",
      distance: 0,
    }).settings;
    expect(settings.panelDistance).toBe(
      OPEN_BRUSH_SETTINGS_LIMITS.panelDistanceMin,
    );

    settings = resolveOpenBrushSettingsCommand(settings, {
      type: "toggle-help",
    }).settings;
    expect(settings.helpVisible).toBe(true);
  });

  it("loads, saves, and resets via injected storage", () => {
    const storage = new MemoryOpenBrushSettingsStorage();
    const store = new OpenBrushSettingsStore(storage);
    const updated = {
      ...createDefaultOpenBrushSettings(),
      dominantHand: "left" as const,
      browserPointerEnabled: false,
    };

    expect(store.load()).toEqual(createDefaultOpenBrushSettings());
    expect(store.save(updated)).toEqual(updated);
    expect(store.load()).toEqual(updated);

    storage.setItem(OPEN_BRUSH_SETTINGS_STORAGE_KEY, "{");
    expect(store.load()).toEqual(createDefaultOpenBrushSettings());

    expect(store.reset()).toEqual(createDefaultOpenBrushSettings());
    expect(storage.getItem(OPEN_BRUSH_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});

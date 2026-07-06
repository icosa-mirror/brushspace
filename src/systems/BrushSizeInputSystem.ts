import { InputComponent, createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushSettings,
  InputCommandState,
  OpenBrushAppState,
  SettingsState,
} from "../components/OpenBrushCore.js";
import { openBrushInventory } from "../openbrush/brush-catalog.js";
import { findBrushByGuid } from "../openbrush/brush-inventory.js";
import { resolveBrushSizeThumbstickAdjustment } from "../openbrush/brush-size.js";
import { resolveEffectiveOpenBrushTool } from "../openbrush/tool-modes.js";

interface CommandGamepad {
  getAxesValues(id: string): Axis2D | undefined;
}

interface Axis2D {
  x: number;
  y: number;
}

type Handedness = "left" | "right";

export class BrushSizeInputSystem extends createSystem({
  appState: { required: [OpenBrushAppState] },
  brushSettings: { required: [BrushSettings] },
  commands: { required: [InputCommandState] },
  settings: { required: [SettingsState] },
}) {
  private lastUpdateTime: number | undefined;

  update(_delta: number, time: number) {
    const frameDeltaSeconds = this.getFrameDeltaSeconds(time);
    const appState = this.getFirstEntity("appState");
    const brushSettings = this.getFirstEntity("brushSettings");
    const commands = this.getFirstEntity("commands");
    const settings = this.getFirstEntity("settings");
    if (!appState || !brushSettings || !commands || !settings) {
      return;
    }
    if (
      !Boolean(settings.getValue(SettingsState, "xrRayEnabled")) ||
      Boolean(commands.getValue(InputCommandState, "paintPressed"))
    ) {
      return;
    }

    const activeTool = resolveEffectiveOpenBrushTool(
      String(appState.getValue(OpenBrushAppState, "activeTool")),
      Boolean(appState.getValue(OpenBrushAppState, "straightEdgeEnabled")),
    );
    if (!activeTool.paints) {
      return;
    }

    const brushHand = this.getDominantHand(settings);
    const gamepad = this.world.input.xr.gamepads[brushHand] as
      | CommandGamepad
      | undefined;
    const axisX = gamepad?.getAxesValues(InputComponent.Thumbstick)?.x ?? 0;
    const brushGuid = String(brushSettings.getValue(BrushSettings, "brushGuid"));
    const brush = findBrushByGuid(openBrushInventory, brushGuid);
    const currentSize01 = Number(brushSettings.getValue(BrushSettings, "size01"));
    const next = resolveBrushSizeThumbstickAdjustment(
      currentSize01,
      axisX,
      frameDeltaSeconds,
      brush?.brushSizeRange,
    );
    if (Math.abs(next.size01 - currentSize01) < 0.000001) {
      return;
    }

    brushSettings.setValue(BrushSettings, "size01", next.size01);
    brushSettings.setValue(BrushSettings, "size", next.size);
    appState.setValue(OpenBrushAppState, "isDirty", true);
  }

  private getDominantHand(settings: Entity): Handedness {
    return String(settings.getValue(SettingsState, "dominantHand")) === "left"
      ? "left"
      : "right";
  }

  private getFirstEntity(
    queryName: "appState" | "brushSettings" | "commands" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getFrameDeltaSeconds(time: number): number {
    const normalizedTime = this.normalizeTimeSeconds(time);
    if (normalizedTime === undefined) {
      return 0;
    }
    if (this.lastUpdateTime === undefined) {
      this.lastUpdateTime = normalizedTime;
      return 0;
    }
    const delta = normalizedTime - this.lastUpdateTime;
    this.lastUpdateTime = normalizedTime;
    return this.normalizeFrameDeltaSeconds(delta);
  }

  private normalizeTimeSeconds(time: number): number | undefined {
    if (!Number.isFinite(time) || time < 0) {
      return undefined;
    }
    return time > 1000 ? time / 1000 : time;
  }

  private normalizeFrameDeltaSeconds(delta: number): number {
    if (!Number.isFinite(delta) || delta <= 0) {
      return 0;
    }
    const seconds = delta > 1 ? delta / 1000 : delta;
    return Math.min(seconds, 0.05);
  }
}

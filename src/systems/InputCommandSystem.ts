import { createSystem, InputComponent } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushPointer,
  InputCommandState,
  OpenBrushAppState,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  clearOpenBrushCommandActivity,
  createOpenBrushCommandInput,
  createOpenBrushCommandSnapshot,
  resetOpenBrushCommandInput,
  resolveOpenBrushInputPressure,
  resolveOpenBrushCommandRouting,
  resolveOpenBrushCommandFrame,
  type OpenBrushCommandRouting,
  type OpenBrushCommandInput,
  type OpenBrushCommandInputs,
  type OpenBrushCommandSnapshot,
} from "../openbrush/command-mapper.js";
import {
  resolveWandPanelThumbstickDirection,
  shouldApplyWandPanelRotation,
  type WandPanelThumbstickDirection,
} from "../openbrush/wand-panel-controls.js";

interface CommandGamepad {
  getButtonPressed(id: string): boolean;
  getButtonDown(id: string): boolean;
  getButtonUp(id: string): boolean;
  getButtonValue(id: string): number;
  getAxesValues(id: string): Axis2D | undefined;
}

interface Axis2D {
  x: number;
  y: number;
}

type Handedness = "left" | "right";

export class InputCommandSystem extends createSystem({
  commands: { required: [InputCommandState] },
  appState: { required: [OpenBrushAppState] },
  settings: { required: [SettingsState] },
  pointers: { required: [BrushPointer] },
}) {
  private readonly xrRightInput = createOpenBrushCommandInput("xr-right", "right");
  private readonly xrLeftInput = createOpenBrushCommandInput("xr-left", "left");
  private readonly browserPointerInput = createOpenBrushCommandInput(
    "browser-pointer",
    "right",
  );
  private readonly keyboardInput = createOpenBrushCommandInput("keyboard", "none");
  private readonly commandInputs: OpenBrushCommandInputs = {
    xrRight: this.xrRightInput,
    xrLeft: this.xrLeftInput,
    browserPointer: this.browserPointerInput,
    keyboard: this.keyboardInput,
  };
  private readonly commandSnapshot: OpenBrushCommandSnapshot =
    createOpenBrushCommandSnapshot();
  private commandRouting: OpenBrushCommandRouting =
    resolveOpenBrushCommandRouting("right");
  private commandRevision = 0;
  private browserPointerEnabled = true;
  private xrRayEnabled = true;
  private wandPanelThumbstickDirection: WandPanelThumbstickDirection = 0;

  init() {
    this.attachBrowserPointerEvents();
  }

  update() {
    const settings = this.getSettingsEntity();
    resolveOpenBrushCommandRouting(
      this.getStringSetting(settings, "dominantHand", "right"),
      this.commandRouting,
    );
    this.browserPointerEnabled = this.getBooleanSetting(
      settings,
      "browserPointerEnabled",
      true,
    );
    this.xrRayEnabled = this.getBooleanSetting(settings, "xrRayEnabled", true);

    this.browserPointerInput.hand = this.commandRouting.brushHand;
    if (!this.browserPointerEnabled) {
      resetOpenBrushCommandInput(this.browserPointerInput);
      this.browserPointerInput.hand = this.commandRouting.brushHand;
    }
    this.updateXrInput(
      this.xrRightInput,
      "right",
      this.commandRouting,
      this.xrRayEnabled,
    );
    this.updateXrInput(
      this.xrLeftInput,
      "left",
      this.commandRouting,
      this.xrRayEnabled,
    );
    this.updateWandPanelRotation(settings);
    this.updateKeyboardInput(this.keyboardInput);

    resolveOpenBrushCommandFrame(
      this.commandInputs,
      this.commandSnapshot,
      this.commandRouting,
    );
    if (this.commandSnapshot.hasCommandEdge) {
      this.commandRevision += 1;
    }

    for (const entity of this.queries.commands.entities) {
      this.applyCommandState(entity);
    }
    for (const entity of this.queries.appState.entities) {
      entity.setValue(OpenBrushAppState, "commandRevision", this.commandRevision);
    }
    for (const entity of this.queries.pointers.entities) {
      this.applyPointerState(entity);
    }

    this.clearFrameEdges();
  }

  private updateXrInput(
    target: OpenBrushCommandInput,
    handedness: Handedness,
    routing: OpenBrushCommandRouting,
    rayEnabled: boolean,
  ): void {
    resetOpenBrushCommandInput(target);
    const gamepad = this.world.input.xr.gamepads[handedness] as
      | CommandGamepad
      | undefined;
    target.connected = !!gamepad;
    if (!gamepad || !rayEnabled) {
      return;
    }

    if (handedness === routing.brushHand) {
      target.paintPressed = gamepad.getButtonPressed(InputComponent.Trigger);
      target.paintDown = gamepad.getButtonDown(InputComponent.Trigger);
      target.paintUp = gamepad.getButtonUp(InputComponent.Trigger);
      target.alternatePressed = gamepad.getButtonPressed(InputComponent.Squeeze);
      target.alternateDown = gamepad.getButtonDown(InputComponent.Squeeze);
      target.alternateUp = gamepad.getButtonUp(InputComponent.Squeeze);
      target.pressure = resolveOpenBrushInputPressure(
        target.paintPressed,
        gamepad.getButtonValue(InputComponent.Trigger),
      );
    }

    if (handedness === routing.wandHand) {
      if (handedness === "right") {
        target.undoDown = gamepad.getButtonDown(InputComponent.A_Button);
        target.redoDown = gamepad.getButtonDown(InputComponent.B_Button);
      } else {
        target.undoDown = gamepad.getButtonDown(InputComponent.X_Button);
        target.redoDown = gamepad.getButtonDown(InputComponent.Y_Button);
      }
    }
  }

  private updateWandPanelRotation(settings: Entity | undefined): void {
    if (!settings || !this.xrRayEnabled) {
      this.wandPanelThumbstickDirection = 0;
      return;
    }

    const gamepad = this.world.input.xr.gamepads[this.commandRouting.wandHand] as
      | CommandGamepad
      | undefined;
    if (!gamepad) {
      this.wandPanelThumbstickDirection = 0;
      return;
    }

    const axes = gamepad.getAxesValues(InputComponent.Thumbstick);
    const nextDirection = resolveWandPanelThumbstickDirection(axes?.x ?? 0);
    if (
      shouldApplyWandPanelRotation(
        this.wandPanelThumbstickDirection,
        nextDirection,
      )
    ) {
      this.applyWandPanelRotation(settings, nextDirection);
    }
    this.wandPanelThumbstickDirection = nextDirection;
  }

  private applyWandPanelRotation(
    settings: Entity,
    direction: WandPanelThumbstickDirection,
  ): void {
    if (direction === 0) {
      return;
    }
    settings.setValue(
      SettingsState,
      "wandPanelRotationSteps",
      Number(settings.getValue(SettingsState, "wandPanelRotationSteps")) +
        direction,
    );
    settings.setValue(
      SettingsState,
      "settingsRevision",
      Number(settings.getValue(SettingsState, "settingsRevision")) + 1,
    );
    settings.setValue(
      SettingsState,
      "lastSettingsCommand",
      "rotate-wand-panel-ring",
    );
    settings.setValue(SettingsState, "settingsStatus", "applied");
  }

  private updateKeyboardInput(target: OpenBrushCommandInput): void {
    resetOpenBrushCommandInput(target);
    const keyboard = this.world.input.keyboard;
    target.paintPressed =
      keyboard.getKeyPressed("Space") || keyboard.getKeyPressed("KeyB");
    target.paintDown =
      keyboard.getKeyDown("Space") || keyboard.getKeyDown("KeyB");
    target.paintUp = keyboard.getKeyUp("Space") || keyboard.getKeyUp("KeyB");
    target.alternatePressed =
      keyboard.getKeyPressed("ShiftLeft") || keyboard.getKeyPressed("ShiftRight");
    target.alternateDown =
      keyboard.getKeyDown("ShiftLeft") || keyboard.getKeyDown("ShiftRight");
    target.alternateUp =
      keyboard.getKeyUp("ShiftLeft") || keyboard.getKeyUp("ShiftRight");
    target.undoDown = keyboard.getKeyDown("KeyZ");
    target.redoDown = keyboard.getKeyDown("KeyY");
    target.brushNextDown = keyboard.getKeyDown("BracketRight");
    target.brushPreviousDown = keyboard.getKeyDown("BracketLeft");
    target.pressure = resolveOpenBrushInputPressure(
      target.paintPressed,
      Number.NaN,
    );
    target.connected =
      target.paintPressed ||
      target.paintDown ||
      target.paintUp ||
      target.alternatePressed ||
      target.alternateDown ||
      target.alternateUp ||
      target.undoDown ||
      target.redoDown ||
      target.brushNextDown ||
      target.brushPreviousDown;
  }

  private attachBrowserPointerEvents(): void {
    const canvas = this.world.renderer.domElement;
    const onPointerDown = (event: PointerEvent) => {
      if (!this.browserPointerEnabled || !event.isPrimary || event.button !== 0) {
        return;
      }
      event.preventDefault();
      this.updateBrowserPointerPosition(event);
      this.browserPointerInput.connected = true;
      this.browserPointerInput.paintPressed = true;
      this.browserPointerInput.paintDown = true;
      this.browserPointerInput.pressure = this.getPointerPressure(event, true);
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {}
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!this.browserPointerEnabled || !event.isPrimary) {
        return;
      }
      this.updateBrowserPointerPosition(event);
      this.browserPointerInput.connected = true;
      this.browserPointerInput.pressure = this.getPointerPressure(
        event,
        this.browserPointerInput.paintPressed,
      );
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }
      if (!this.browserPointerEnabled) {
        clearOpenBrushCommandActivity(this.browserPointerInput);
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {}
        return;
      }
      event.preventDefault();
      this.updateBrowserPointerPosition(event);
      this.browserPointerInput.connected = true;
      this.browserPointerInput.paintPressed = false;
      this.browserPointerInput.paintUp = true;
      this.browserPointerInput.pressure = 0;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    });
  }

  private updateBrowserPointerPosition(event: PointerEvent): void {
    const rect = this.world.renderer.domElement.getBoundingClientRect();
    this.browserPointerInput.pointerX = event.clientX - rect.left;
    this.browserPointerInput.pointerY = event.clientY - rect.top;
  }

  private getPointerPressure(event: PointerEvent, pressed: boolean): number {
    return resolveOpenBrushInputPressure(pressed, event.pressure);
  }

  private applyCommandState(entity: Entity): void {
    entity.setValue(InputCommandState, "source", this.commandSnapshot.source);
    entity.setValue(InputCommandState, "primaryHand", this.commandSnapshot.hand);
    entity.setValue(
      InputCommandState,
      "paintPressed",
      this.commandSnapshot.paintPressed,
    );
    entity.setValue(InputCommandState, "paintDown", this.commandSnapshot.paintDown);
    entity.setValue(InputCommandState, "paintUp", this.commandSnapshot.paintUp);
    entity.setValue(
      InputCommandState,
      "alternatePressed",
      this.commandSnapshot.alternatePressed,
    );
    entity.setValue(
      InputCommandState,
      "alternateDown",
      this.commandSnapshot.alternateDown,
    );
    entity.setValue(
      InputCommandState,
      "alternateUp",
      this.commandSnapshot.alternateUp,
    );
    entity.setValue(InputCommandState, "undoDown", this.commandSnapshot.undoDown);
    entity.setValue(InputCommandState, "redoDown", this.commandSnapshot.redoDown);
    entity.setValue(
      InputCommandState,
      "brushNextDown",
      this.commandSnapshot.brushNextDown,
    );
    entity.setValue(
      InputCommandState,
      "brushPreviousDown",
      this.commandSnapshot.brushPreviousDown,
    );
    entity.setValue(InputCommandState, "pressure", this.commandSnapshot.pressure);
    entity.setValue(InputCommandState, "pointerX", this.commandSnapshot.pointerX);
    entity.setValue(InputCommandState, "pointerY", this.commandSnapshot.pointerY);
    entity.setValue(
      InputCommandState,
      "leftControllerConnected",
      this.commandSnapshot.leftControllerConnected,
    );
    entity.setValue(
      InputCommandState,
      "rightControllerConnected",
      this.commandSnapshot.rightControllerConnected,
    );
    entity.setValue(
      InputCommandState,
      "commandRevision",
      this.commandRevision,
    );
  }

  private applyPointerState(entity: Entity): void {
    const hand = String(entity.getValue(BrushPointer, "hand"));
    const shouldApply =
      hand === this.commandSnapshot.hand ||
      (this.commandSnapshot.hand === "none" &&
        hand === this.commandRouting.brushHand);
    entity.setValue(
      BrushPointer,
      "isDrawing",
      shouldApply && this.commandSnapshot.paintPressed,
    );
    entity.setValue(
      BrushPointer,
      "pressure",
      shouldApply ? this.commandSnapshot.pressure : 0,
    );
  }

  private clearFrameEdges(): void {
    this.browserPointerInput.paintDown = false;
    this.browserPointerInput.paintUp = false;
    this.browserPointerInput.alternateDown = false;
    this.browserPointerInput.alternateUp = false;
    this.browserPointerInput.undoDown = false;
    this.browserPointerInput.redoDown = false;
    this.browserPointerInput.brushNextDown = false;
    this.browserPointerInput.brushPreviousDown = false;
  }

  private getSettingsEntity(): Entity | undefined {
    const next = this.queries.settings.entities.values().next();
    if (next.done) {
      return undefined;
    }
    return next.value;
  }

  private getStringSetting(
    entity: Entity | undefined,
    field: "dominantHand",
    fallback: string,
  ): string {
    if (!entity) {
      return fallback;
    }
    return String(entity.getValue(SettingsState, field));
  }

  private getBooleanSetting(
    entity: Entity | undefined,
    field: "browserPointerEnabled" | "xrRayEnabled",
    fallback: boolean,
  ): boolean {
    if (!entity) {
      return fallback;
    }
    return Boolean(entity.getValue(SettingsState, field));
  }
}

export type OpenBrushCommandSource =
  | "idle"
  | "xr-right"
  | "xr-left"
  | "browser-pointer"
  | "keyboard";

export type OpenBrushCommandHand = "none" | "left" | "right";
export type OpenBrushControllerHand = "left" | "right";

export interface OpenBrushCommandRouting {
  brushHand: OpenBrushControllerHand;
  wandHand: OpenBrushControllerHand;
}

export interface OpenBrushCommandInput {
  source: OpenBrushCommandSource;
  hand: OpenBrushCommandHand;
  connected: boolean;
  paintPressed: boolean;
  paintDown: boolean;
  paintUp: boolean;
  alternatePressed: boolean;
  alternateDown: boolean;
  alternateUp: boolean;
  undoDown: boolean;
  redoDown: boolean;
  brushNextDown: boolean;
  brushPreviousDown: boolean;
  pressure: number;
  pointerX: number;
  pointerY: number;
}

export interface OpenBrushCommandInputs {
  xrRight: OpenBrushCommandInput;
  xrLeft: OpenBrushCommandInput;
  browserPointer: OpenBrushCommandInput;
  keyboard: OpenBrushCommandInput;
}

export interface OpenBrushCommandSnapshot extends OpenBrushCommandInput {
  leftControllerConnected: boolean;
  rightControllerConnected: boolean;
  hasCommandEdge: boolean;
}

export const OPEN_BRUSH_DIGITAL_PRESSURE = 0.5;

export function createOpenBrushCommandInput(
  source: OpenBrushCommandSource,
  hand: OpenBrushCommandHand,
): OpenBrushCommandInput {
  return {
    source,
    hand,
    connected: false,
    paintPressed: false,
    paintDown: false,
    paintUp: false,
    alternatePressed: false,
    alternateDown: false,
    alternateUp: false,
    undoDown: false,
    redoDown: false,
    brushNextDown: false,
    brushPreviousDown: false,
    pressure: 0,
    pointerX: 0,
    pointerY: 0,
  };
}

export function createOpenBrushCommandSnapshot(): OpenBrushCommandSnapshot {
  return {
    ...createOpenBrushCommandInput("idle", "none"),
    leftControllerConnected: false,
    rightControllerConnected: false,
    hasCommandEdge: false,
  };
}

export function resolveOpenBrushCommandRouting(
  dominantHand: string,
  out: OpenBrushCommandRouting = {
    brushHand: "right",
    wandHand: "left",
  },
): OpenBrushCommandRouting {
  const brushHand = dominantHand === "left" ? "left" : "right";
  out.brushHand = brushHand;
  out.wandHand = brushHand === "left" ? "right" : "left";
  return out;
}

export function resetOpenBrushCommandInput(input: OpenBrushCommandInput): void {
  input.connected = false;
  clearOpenBrushCommandActivity(input);
}

export function clearOpenBrushCommandActivity(input: OpenBrushCommandInput): void {
  input.paintPressed = false;
  input.paintDown = false;
  input.paintUp = false;
  input.alternatePressed = false;
  input.alternateDown = false;
  input.alternateUp = false;
  input.undoDown = false;
  input.redoDown = false;
  input.brushNextDown = false;
  input.brushPreviousDown = false;
  input.pressure = 0;
  input.pointerX = 0;
  input.pointerY = 0;
}

export function resolveOpenBrushInputPressure(
  pressed: boolean,
  analogValue: number,
  digitalFallback = OPEN_BRUSH_DIGITAL_PRESSURE,
): number {
  if (!pressed) {
    return 0;
  }
  if (Number.isFinite(analogValue) && analogValue > 0) {
    return clamp01(analogValue);
  }
  return clamp01(digitalFallback);
}

export function resolveOpenBrushCommandFrame(
  inputs: OpenBrushCommandInputs,
  out: OpenBrushCommandSnapshot,
  routing: OpenBrushCommandRouting = defaultRouting,
): OpenBrushCommandSnapshot {
  const selected = selectPrimaryInput(inputs, routing);
  out.source = selected.source;
  out.hand = selected.hand;
  out.connected = selected.connected;
  out.paintPressed = selected.paintPressed;
  out.paintDown = selected.paintDown;
  out.paintUp = selected.paintUp;
  out.alternatePressed = selected.alternatePressed;
  out.alternateDown = selected.alternateDown;
  out.alternateUp = selected.alternateUp;
  out.undoDown =
    inputs.xrRight.undoDown ||
    inputs.xrLeft.undoDown ||
    inputs.browserPointer.undoDown ||
    inputs.keyboard.undoDown;
  out.redoDown =
    inputs.xrRight.redoDown ||
    inputs.xrLeft.redoDown ||
    inputs.browserPointer.redoDown ||
    inputs.keyboard.redoDown;
  out.brushNextDown =
    inputs.xrRight.brushNextDown ||
    inputs.xrLeft.brushNextDown ||
    inputs.browserPointer.brushNextDown ||
    inputs.keyboard.brushNextDown;
  out.brushPreviousDown =
    inputs.xrRight.brushPreviousDown ||
    inputs.xrLeft.brushPreviousDown ||
    inputs.browserPointer.brushPreviousDown ||
    inputs.keyboard.brushPreviousDown;
  out.pressure = clamp01(selected.pressure);
  out.pointerX = selected.pointerX;
  out.pointerY = selected.pointerY;
  out.leftControllerConnected = inputs.xrLeft.connected;
  out.rightControllerConnected = inputs.xrRight.connected;
  out.hasCommandEdge =
    out.paintDown ||
    out.paintUp ||
    out.alternateDown ||
    out.alternateUp ||
    out.undoDown ||
    out.redoDown ||
    out.brushNextDown ||
    out.brushPreviousDown;
  return out;
}

function selectPrimaryInput(
  inputs: OpenBrushCommandInputs,
  routing: OpenBrushCommandRouting,
): OpenBrushCommandInput {
  const brushInput = getXrInputForHand(inputs, routing.brushHand);
  const wandInput = getXrInputForHand(inputs, routing.wandHand);
  if (hasInputActivity(brushInput)) {
    return brushInput;
  }
  if (hasInputActivity(wandInput)) {
    return wandInput;
  }
  if (hasInputActivity(inputs.browserPointer)) {
    return inputs.browserPointer;
  }
  if (hasInputActivity(inputs.keyboard)) {
    return inputs.keyboard;
  }
  if (brushInput.connected) {
    return brushInput;
  }
  if (wandInput.connected) {
    return wandInput;
  }
  if (inputs.browserPointer.connected) {
    return inputs.browserPointer;
  }
  if (inputs.keyboard.connected) {
    return inputs.keyboard;
  }
  return idleInput;
}

function getXrInputForHand(
  inputs: OpenBrushCommandInputs,
  hand: OpenBrushControllerHand,
): OpenBrushCommandInput {
  return hand === "left" ? inputs.xrLeft : inputs.xrRight;
}

function hasInputActivity(input: OpenBrushCommandInput): boolean {
  return (
    input.paintPressed ||
    input.paintDown ||
    input.paintUp ||
    input.alternatePressed ||
    input.alternateDown ||
    input.alternateUp ||
    input.undoDown ||
    input.redoDown ||
    input.brushNextDown ||
    input.brushPreviousDown
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

const idleInput: OpenBrushCommandInput = {
  source: "idle",
  hand: "none",
  connected: false,
  paintPressed: false,
  paintDown: false,
  paintUp: false,
  alternatePressed: false,
  alternateDown: false,
  alternateUp: false,
  undoDown: false,
  redoDown: false,
  brushNextDown: false,
  brushPreviousDown: false,
  pressure: 0,
  pointerX: 0,
  pointerY: 0,
};

const defaultRouting = resolveOpenBrushCommandRouting("right");

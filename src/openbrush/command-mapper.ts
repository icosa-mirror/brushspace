export type OpenBrushCommandSource =
  | "idle"
  | "xr-right"
  | "xr-left"
  | "browser-pointer"
  | "keyboard";

export type OpenBrushCommandHand = "none" | "left" | "right";

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

export function resetOpenBrushCommandInput(input: OpenBrushCommandInput): void {
  input.connected = false;
  input.paintPressed = false;
  input.paintDown = false;
  input.paintUp = false;
  input.alternatePressed = false;
  input.alternateDown = false;
  input.alternateUp = false;
  input.undoDown = false;
  input.redoDown = false;
  input.pressure = 0;
  input.pointerX = 0;
  input.pointerY = 0;
}

export function resolveOpenBrushCommandFrame(
  inputs: OpenBrushCommandInputs,
  out: OpenBrushCommandSnapshot,
): OpenBrushCommandSnapshot {
  const selected = selectPrimaryInput(inputs);
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
    out.redoDown;
  return out;
}

function selectPrimaryInput(
  inputs: OpenBrushCommandInputs,
): OpenBrushCommandInput {
  if (hasInputActivity(inputs.xrRight)) {
    return inputs.xrRight;
  }
  if (hasInputActivity(inputs.xrLeft)) {
    return inputs.xrLeft;
  }
  if (hasInputActivity(inputs.browserPointer)) {
    return inputs.browserPointer;
  }
  if (hasInputActivity(inputs.keyboard)) {
    return inputs.keyboard;
  }
  if (inputs.xrRight.connected) {
    return inputs.xrRight;
  }
  if (inputs.xrLeft.connected) {
    return inputs.xrLeft;
  }
  if (inputs.browserPointer.connected) {
    return inputs.browserPointer;
  }
  if (inputs.keyboard.connected) {
    return inputs.keyboard;
  }
  return idleInput;
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
    input.redoDown
  );
}

function clamp01(value: number): number {
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
  pressure: 0,
  pointerX: 0,
  pointerY: 0,
};

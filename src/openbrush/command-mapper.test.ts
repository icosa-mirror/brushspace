import { describe, expect, it } from "vitest";

import {
  clearOpenBrushCommandActivity,
  createOpenBrushCommandInput,
  createOpenBrushCommandSnapshot,
  resolveOpenBrushCommandRouting,
  resolveOpenBrushCommandFrame,
  type OpenBrushCommandInputs,
} from "./command-mapper.js";

function createInputs(): OpenBrushCommandInputs {
  return {
    xrRight: createOpenBrushCommandInput("xr-right", "right"),
    xrLeft: createOpenBrushCommandInput("xr-left", "left"),
    browserPointer: createOpenBrushCommandInput("browser-pointer", "right"),
    keyboard: createOpenBrushCommandInput("keyboard", "none"),
  };
}

describe("Open Brush command mapper", () => {
  it("maps right XR trigger state to the shared paint command", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.xrRight.paintPressed = true;
    inputs.xrRight.paintDown = true;
    inputs.xrRight.pressure = 0.72;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(snapshot.source).toBe("xr-right");
    expect(snapshot.hand).toBe("right");
    expect(snapshot.paintPressed).toBe(true);
    expect(snapshot.paintDown).toBe(true);
    expect(snapshot.pressure).toBeCloseTo(0.72);
    expect(snapshot.rightControllerConnected).toBe(true);
    expect(snapshot.hasCommandEdge).toBe(true);
  });

  it("maps browser pointer and keyboard paint to the same command fields", () => {
    const pointerInputs = createInputs();
    pointerInputs.browserPointer.connected = true;
    pointerInputs.browserPointer.paintPressed = true;
    pointerInputs.browserPointer.paintDown = true;
    pointerInputs.browserPointer.pressure = 0.5;
    pointerInputs.browserPointer.pointerX = 320;
    pointerInputs.browserPointer.pointerY = 240;

    const keyboardInputs = createInputs();
    keyboardInputs.keyboard.connected = true;
    keyboardInputs.keyboard.paintPressed = true;
    keyboardInputs.keyboard.paintDown = true;
    keyboardInputs.keyboard.pressure = 1;

    const pointerSnapshot = resolveOpenBrushCommandFrame(
      pointerInputs,
      createOpenBrushCommandSnapshot(),
    );
    const keyboardSnapshot = resolveOpenBrushCommandFrame(
      keyboardInputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(pointerSnapshot.source).toBe("browser-pointer");
    expect(keyboardSnapshot.source).toBe("keyboard");
    expect(pointerSnapshot.paintPressed).toBe(keyboardSnapshot.paintPressed);
    expect(pointerSnapshot.paintDown).toBe(keyboardSnapshot.paintDown);
    expect(pointerSnapshot.hasCommandEdge).toBe(keyboardSnapshot.hasCommandEdge);
    expect(pointerSnapshot.pointerX).toBe(320);
    expect(pointerSnapshot.pointerY).toBe(240);
  });

  it("lets active keyboard shortcuts override an idle connected XR controller", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.keyboard.connected = true;
    inputs.keyboard.undoDown = true;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(snapshot.source).toBe("keyboard");
    expect(snapshot.undoDown).toBe(true);
    expect(snapshot.rightControllerConnected).toBe(true);
    expect(snapshot.hasCommandEdge).toBe(true);
  });

  it("reports idle connected XR controllers when no command is active", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.xrLeft.connected = true;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(snapshot.source).toBe("xr-right");
    expect(snapshot.paintPressed).toBe(false);
    expect(snapshot.leftControllerConnected).toBe(true);
    expect(snapshot.rightControllerConnected).toBe(true);
    expect(snapshot.hasCommandEdge).toBe(false);
  });

  it("clears disabled XR command activity while preserving controller connection", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.xrRight.paintPressed = true;
    inputs.xrRight.paintDown = true;
    inputs.xrRight.undoDown = true;
    inputs.xrRight.pressure = 1;

    clearOpenBrushCommandActivity(inputs.xrRight);

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(snapshot.source).toBe("xr-right");
    expect(snapshot.rightControllerConnected).toBe(true);
    expect(snapshot.paintPressed).toBe(false);
    expect(snapshot.undoDown).toBe(false);
    expect(snapshot.pressure).toBe(0);
    expect(snapshot.hasCommandEdge).toBe(false);
  });

  it("lets keyboard commands win after browser pointer input is disabled", () => {
    const inputs = createInputs();
    inputs.browserPointer.connected = true;
    inputs.browserPointer.paintPressed = true;
    inputs.browserPointer.paintDown = true;
    inputs.browserPointer.pressure = 1;
    inputs.keyboard.connected = true;
    inputs.keyboard.undoDown = true;

    clearOpenBrushCommandActivity(inputs.browserPointer);
    inputs.browserPointer.connected = false;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(snapshot.source).toBe("keyboard");
    expect(snapshot.paintPressed).toBe(false);
    expect(snapshot.undoDown).toBe(true);
    expect(snapshot.hasCommandEdge).toBe(true);
  });

  it("prioritizes the configured brush hand when XR controllers are idle", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.xrLeft.connected = true;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
      resolveOpenBrushCommandRouting("left"),
    );

    expect(snapshot.source).toBe("xr-left");
    expect(snapshot.hand).toBe("left");
    expect(snapshot.leftControllerConnected).toBe(true);
    expect(snapshot.rightControllerConnected).toBe(true);
    expect(snapshot.hasCommandEdge).toBe(false);
  });

  it("keeps wand command edges available with left-hand brush routing", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.xrRight.undoDown = true;
    inputs.xrLeft.connected = true;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
      resolveOpenBrushCommandRouting("left"),
    );

    expect(snapshot.source).toBe("xr-right");
    expect(snapshot.hand).toBe("right");
    expect(snapshot.undoDown).toBe(true);
    expect(snapshot.hasCommandEdge).toBe(true);
  });

  it("maps brush cycling commands as command edges", () => {
    const inputs = createInputs();
    inputs.xrRight.connected = true;
    inputs.keyboard.connected = true;
    inputs.keyboard.brushNextDown = true;

    const snapshot = resolveOpenBrushCommandFrame(
      inputs,
      createOpenBrushCommandSnapshot(),
    );

    expect(snapshot.source).toBe("keyboard");
    expect(snapshot.brushNextDown).toBe(true);
    expect(snapshot.brushPreviousDown).toBe(false);
    expect(snapshot.hasCommandEdge).toBe(true);
  });
});

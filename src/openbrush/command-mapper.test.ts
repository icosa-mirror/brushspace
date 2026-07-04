import { describe, expect, it } from "vitest";

import {
  createOpenBrushCommandInput,
  createOpenBrushCommandSnapshot,
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
});

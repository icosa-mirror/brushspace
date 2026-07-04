import type { Entity, World } from "@iwsdk/core";

import {
  BrushPointer,
  BrushCatalogState,
  BrushSettings,
  CanvasLayer,
  InputCommandState,
  OpenBrushAppState,
  StrokeHistoryState,
} from "../components/OpenBrushCore.js";
import { PHASE1_FIXTURE_BRUSH_GUID } from "./fixtures.js";

export interface OpenBrushShellEntities {
  appState: Entity;
  mainCanvas: Entity;
  selectionCanvas: Entity;
  rightPointer: Entity;
}

export function setupOpenBrushShell(world: World): OpenBrushShellEntities {
  const appState = world
    .createTransformEntity()
    .addComponent(OpenBrushAppState, {
      mode: "ready",
      activeTool: "free-paint",
      activeLayerIndex: 0,
      isDirty: false,
      commandRevision: 0,
    })
    .addComponent(BrushSettings, {
      brushGuid: PHASE1_FIXTURE_BRUSH_GUID,
      size: 0.42,
      color: [0.1, 0.45, 0.95, 1],
    })
    .addComponent(InputCommandState)
    .addComponent(StrokeHistoryState)
    .addComponent(BrushCatalogState);
  appState.object3D!.name = "OpenBrushAppState";

  const mainCanvas = world.createTransformEntity().addComponent(CanvasLayer, {
    layerIndex: 0,
    order: 0,
    layerName: "Sketch",
    visible: true,
    locked: false,
    selectionCanvas: false,
    active: true,
  });
  mainCanvas.object3D!.name = "OpenBrushMainCanvas";

  const selectionCanvas = world.createTransformEntity().addComponent(CanvasLayer, {
    layerIndex: 1,
    order: 0,
    layerName: "Selection",
    visible: true,
    locked: false,
    selectionCanvas: true,
    active: false,
  });
  selectionCanvas.object3D!.name = "OpenBrushSelectionCanvas";

  const rightPointer = world.createTransformEntity().addComponent(BrushPointer, {
    hand: "right",
    tool: "free-paint",
    isDrawing: false,
    pressure: 0,
    sampleCount: 0,
  });
  rightPointer.object3D!.name = "OpenBrushRightBrushPointer";
  rightPointer.object3D!.position.set(0.25, 1.1, -0.6);

  return { appState, mainCanvas, selectionCanvas, rightPointer };
}

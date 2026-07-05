import {
  Interactable,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  SphereGeometry,
} from "@iwsdk/core";
import type { Entity, World } from "@iwsdk/core";

import {
  AudioFeedbackState,
  BrushPointer,
  BrushCatalogState,
  BrushSettings,
  CanvasLayer,
  InputCommandState,
  OpenBrushAppState,
  PerformanceState,
  PlaybackState,
  PersistenceState,
  SelectionState,
  SelectionWidget,
  SettingsState,
  StrokeHistoryState,
  UiCommandHistoryState,
} from "../components/OpenBrushCore.js";
import {
  OPEN_BRUSH_DEFAULT_SIZE01,
  brushSize01ToLiveBrushSize,
} from "./brush-size.js";
import { findBrushByGuid } from "./brush-inventory.js";
import {
  OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  openBrushInventory,
} from "./brush-catalog.js";

export interface OpenBrushShellEntities {
  appState: Entity;
  mainCanvas: Entity;
  selectionCanvas: Entity;
  selectionWidget: Entity;
  leftPointer: Entity;
  rightPointer: Entity;
}

export function setupOpenBrushShell(world: World): OpenBrushShellEntities {
  const initialBrush = findBrushByGuid(
    openBrushInventory,
    OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  );
  const appState = world
    .createTransformEntity()
    .addComponent(OpenBrushAppState, {
      mode: "ready",
      activeTool: "free-paint",
      previousTool: "free-paint",
      toolStatus: "draw-ready",
      toolRevision: 0,
      activeLayerIndex: 0,
      isDirty: false,
      commandRevision: 0,
    })
    .addComponent(BrushSettings, {
      brushGuid: OPEN_BRUSH_DEFAULT_BRUSH_GUID,
      size01: OPEN_BRUSH_DEFAULT_SIZE01,
      size: brushSize01ToLiveBrushSize(
        OPEN_BRUSH_DEFAULT_SIZE01,
        initialBrush?.brushSizeRange,
      ),
      color: [0.1, 0.45, 0.95, 1],
    })
    .addComponent(InputCommandState)
    .addComponent(AudioFeedbackState)
    .addComponent(UiCommandHistoryState)
    .addComponent(SettingsState)
    .addComponent(PerformanceState)
    .addComponent(PersistenceState)
    .addComponent(PlaybackState)
    .addComponent(SelectionState)
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

  const widgetMesh = new Mesh(
    new SphereGeometry(0.055, 16, 12),
    new MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.9,
    }),
  );
  widgetMesh.name = "OpenBrushSelectionWidgetMesh";
  widgetMesh.visible = false;
  const selectionWidget = world
    .createTransformEntity(widgetMesh)
    .addComponent(SelectionWidget)
    .addComponent(Interactable)
    .addComponent(OneHandGrabbable, {
      rotate: false,
      translate: true,
    });
  selectionWidget.object3D!.name = "OpenBrushSelectionWidget";

  const leftPointer = createBrushPointer(world, "left");
  leftPointer.object3D!.position.set(-0.25, 1.1, -0.6);

  const rightPointer = createBrushPointer(world, "right");
  rightPointer.object3D!.position.set(0.25, 1.1, -0.6);

  return {
    appState,
    mainCanvas,
    selectionCanvas,
    selectionWidget,
    leftPointer,
    rightPointer,
  };
}

function createBrushPointer(world: World, hand: "left" | "right"): Entity {
  const pointer = world.createTransformEntity().addComponent(BrushPointer, {
    hand,
    tool: "free-paint",
    isDrawing: false,
    pressure: 0,
    sampleCount: 0,
  });
  pointer.object3D!.name =
    hand === "left" ? "OpenBrushLeftBrushPointer" : "OpenBrushRightBrushPointer";
  return pointer;
}

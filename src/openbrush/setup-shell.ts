import {
  DomeGradient,
  IBLGradient,
  Interactable,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  SphereGeometry,
} from "@iwsdk/core";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Entity, World } from "@iwsdk/core";

import {
  AudioFeedbackState,
  BrushPointer,
  BrushCatalogState,
  BrushSettings,
  CanvasLayer,
  InputCommandState,
  OpenBrushCameraState,
  OpenBrushEraserCursor,
  OpenBrushScenePose,
  OpenBrushTipAnchor,
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
import { buildOpenBrushToolSphereSegments } from "./eraser-cursor.js";
import {
  OPEN_BRUSH_DEFAULT_ERASER_RADIUS,
  OPEN_BRUSH_TIP_ANCHOR_POSITION_LEFT,
  OPEN_BRUSH_TIP_ANCHOR_POSITION_RIGHT,
  OPEN_BRUSH_TIP_ANCHOR_QUATERNION_LEFT,
  OPEN_BRUSH_TIP_ANCHOR_QUATERNION_RIGHT,
  OPEN_BRUSH_ERASER_FORWARD_OFFSET,
} from "./tools.js";

// ENVIRONMENT_STANDARD gradient skybox: m_SkyboxColorB at the zenith,
// m_SkyboxColorA at the horizon.
const OPEN_BRUSH_DARK_SKY: [number, number, number, number] = [
  0.022,
  0.022,
  0.055,
  1,
];
// The dome blends colors over a wide altitude band, so the horizon value is
// tuned below m_SkyboxColorA to match the app's narrow horizon glow.
const OPEN_BRUSH_DARK_EQUATOR: [number, number, number, number] = [
  0.09,
  0.09,
  0.125,
  1,
];
const OPEN_BRUSH_DARK_GROUND: [number, number, number, number] = [
  0.02,
  0.02,
  0.033,
  1,
];
const OPEN_BRUSH_DARK_DOME_INTENSITY = 0.9;
const OPEN_BRUSH_DARK_IBL_INTENSITY = 0.35;

export interface OpenBrushShellEntities {
  appState: Entity;
  scenePose: Entity;
  mainCanvas: Entity;
  selectionCanvas: Entity;
  selectionWidget: Entity;
  eraserCursor: Entity;
  leftPointer: Entity;
  rightPointer: Entity;
}

export function setupOpenBrushShell(world: World): OpenBrushShellEntities {
  applyOpenBrushDarkEnvironment(world);

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
      straightEdgeEnabled: false,
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
    .addComponent(OpenBrushCameraState)
    .addComponent(PerformanceState)
    .addComponent(PersistenceState)
    .addComponent(PlaybackState)
    .addComponent(SelectionState)
    .addComponent(StrokeHistoryState)
    .addComponent(BrushCatalogState);
  appState.object3D!.name = "OpenBrushAppState";

  const scenePose = world
    .createTransformEntity()
    .addComponent(OpenBrushScenePose);
  scenePose.object3D!.name = "OpenBrushScenePose";

  const mainCanvas = world
    .createTransformEntity(undefined, scenePose)
    .addComponent(CanvasLayer, {
    layerIndex: 0,
    order: 0,
    layerName: "Sketch",
    visible: true,
    locked: false,
    selectionCanvas: false,
    active: true,
  });
  mainCanvas.object3D!.name = "OpenBrushMainCanvas";

  const selectionCanvas = world
    .createTransformEntity(undefined, scenePose)
    .addComponent(CanvasLayer, {
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

  // Fat-line wireframe globe like Open Brush's selectionsphere tool mesh;
  // the entity scale sets the radius while the line width stays constant.
  const eraserCursorGeometry = new LineSegmentsGeometry();
  eraserCursorGeometry.setPositions(buildOpenBrushToolSphereSegments());
  // IWSDK's ray BVH path expects triangle geometry; these decorative lines
  // never raycast (same sentinel as the panel borders).
  (eraserCursorGeometry as unknown as { boundsTree: LineSegmentsGeometry }).boundsTree =
    eraserCursorGeometry;
  const eraserCursorMesh = new LineSegments2(
    eraserCursorGeometry,
    new LineMaterial({
      color: 0xffffff,
      linewidth: 0.0022,
      worldUnits: true,
      transparent: false,
      depthTest: true,
    }),
  );
  eraserCursorMesh.raycast = () => {};
  eraserCursorMesh.name = "OpenBrushEraserCursorMesh";
  eraserCursorMesh.visible = false;
  const eraserCursor = world
    .createTransformEntity(eraserCursorMesh)
    .addComponent(OpenBrushEraserCursor, {
      hand: "right",
      radius: OPEN_BRUSH_DEFAULT_ERASER_RADIUS,
      forwardOffset: OPEN_BRUSH_ERASER_FORWARD_OFFSET,
      hot: false,
      visible: false,
    });
  eraserCursor.object3D!.name = "OpenBrushEraserCursor";

  for (const hand of ["left", "right"] as const) {
    const gripEntity = world.playerSpaceEntities.gripSpaces[hand];
    const anchor = world
      .createTransformEntity(undefined, gripEntity)
      .addComponent(OpenBrushTipAnchor, { hand });
    anchor.object3D!.name = `OpenBrushTipAnchor_${hand}`;
    anchor.object3D!.position.set(
      ...(hand === "left"
        ? OPEN_BRUSH_TIP_ANCHOR_POSITION_LEFT
        : OPEN_BRUSH_TIP_ANCHOR_POSITION_RIGHT),
    );
    anchor.object3D!.quaternion.set(
      ...(hand === "left"
        ? OPEN_BRUSH_TIP_ANCHOR_QUATERNION_LEFT
        : OPEN_BRUSH_TIP_ANCHOR_QUATERNION_RIGHT),
    );
  }

  const leftPointer = createBrushPointer(world, "left");
  leftPointer.object3D!.position.set(-0.25, 1.1, -0.6);

  const rightPointer = createBrushPointer(world, "right");
  rightPointer.object3D!.position.set(0.25, 1.1, -0.6);

  return {
    appState,
    scenePose,
    mainCanvas,
    selectionCanvas,
    selectionWidget,
    eraserCursor,
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

function applyOpenBrushDarkEnvironment(world: World): void {
  const levelRoot = world.activeLevel.value;
  if (!levelRoot) {
    return;
  }
  if (!levelRoot.hasComponent(DomeGradient)) {
    levelRoot.addComponent(DomeGradient);
  }
  writeEnvironmentGradient(
    levelRoot,
    DomeGradient,
    OPEN_BRUSH_DARK_DOME_INTENSITY,
  );
  if (!levelRoot.hasComponent(IBLGradient)) {
    levelRoot.addComponent(IBLGradient);
  }
  writeEnvironmentGradient(levelRoot, IBLGradient, OPEN_BRUSH_DARK_IBL_INTENSITY);
}

function writeEnvironmentGradient(
  entity: Entity,
  component: typeof DomeGradient | typeof IBLGradient,
  intensity: number,
): void {
  writeColor(
    entity.getVectorView(component, "sky") as Float32Array,
    OPEN_BRUSH_DARK_SKY,
  );
  writeColor(
    entity.getVectorView(component, "equator") as Float32Array,
    OPEN_BRUSH_DARK_EQUATOR,
  );
  writeColor(
    entity.getVectorView(component, "ground") as Float32Array,
    OPEN_BRUSH_DARK_GROUND,
  );
  entity.setValue(component, "intensity", intensity);
  entity.setValue(component, "_needsUpdate", true);
}

function writeColor(
  target: Float32Array,
  color: readonly [number, number, number, number],
): void {
  for (let i = 0; i < 4; i += 1) {
    target[i] = color[i];
  }
}

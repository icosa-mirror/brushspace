import "./three-workarounds.js";

import { SessionMode, VisibilityState, World } from "@iwsdk/core";
import { AnimatedController } from "@iwsdk/xr-input";
import * as horizonKit from "@pmndrs/uikit-horizon";
import {
  BrushIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EraserIcon,
  HouseIcon,
  MinusIcon,
  PaintbrushIcon,
  PaletteIcon,
  PipetteIcon,
  PlusIcon,
  Redo2Icon,
  RulerIcon,
  SaveIcon,
  Share2Icon,
  SwatchBookIcon,
  Undo2Icon,
  UsersIcon,
} from "@pmndrs/uikit-lucide";

import { PanelUI, RayInteractable } from "@iwsdk/core";

import { OpenBrushDebug } from "./components/OpenBrushDebug.js";
import {
  OpenBrushBrushPage,
  OpenBrushPanelAttachment,
} from "./components/OpenBrushCore.js";

import { PanelSystem } from "./panel.js";

import { setupOpenBrushShell } from "./openbrush/setup-shell.js";

import { AudioFeedbackSystem } from "./systems/AudioFeedbackSystem.js";
import { BrushAudioSystem } from "./systems/BrushAudioSystem.js";
import { BrushCatalogSystem } from "./systems/BrushCatalogSystem.js";
import { BrushPageSystem } from "./systems/BrushPageSystem.js";
import { ColorPickerSystem } from "./systems/ColorPickerSystem.js";
import { BrushSizeInputSystem } from "./systems/BrushSizeInputSystem.js";
import { CameraToolSystem } from "./systems/CameraToolSystem.js";
import { CollabSystem } from "./systems/CollabSystem.js";
import { BrushPointerVisualSystem } from "./systems/BrushPointerVisualSystem.js";
import { EraserCursorSystem } from "./systems/EraserCursorSystem.js";
import { InputCommandSystem } from "./systems/InputCommandSystem.js";
import { IntroSketchSystem } from "./systems/IntroSketchSystem.js";
import { LayerCanvasSystem } from "./systems/LayerCanvasSystem.js";
import { PanelAttachmentSystem } from "./systems/PanelAttachmentSystem.js";
import { PerformanceCounterSystem } from "./systems/PerformanceCounterSystem.js";
import { RuntimeDebugSystem } from "./systems/RuntimeDebugSystem.js";
import { SelectionSystem } from "./systems/SelectionSystem.js";
import { SketchLibrarySystem } from "./systems/SketchLibrarySystem.js";
import { StandardEnvironmentSystem } from "./systems/StandardEnvironmentSystem.js";
import { StrokeAuthoringSystem } from "./systems/StrokeAuthoringSystem.js";
import { TargetRaySpaceWebXRDebugSystem } from "./systems/TargetRaySpaceWebXRDebugSystem.js";
import { TipAnchorTuningSystem } from "./systems/TipAnchorTuningSystem.js";
import { WorldGrabSystem } from "./systems/WorldGrabSystem.js";
import { WorldGrabVisualsSystem } from "./systems/WorldGrabVisualsSystem.js";

AnimatedController.useSimpleMaterial = true;

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: false,
    grabbing: true,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
    spatialUI: {
      // No 2D interaction: the landing page is view-only (drawing and all
      // panels are in-session; offer:"always" provides Enter XR).
      forwardHtmlEvents: false,
      preferredColorScheme: "dark",
      kits: [
        horizonKit,
        {
          BrushIcon,
          CameraIcon,
          ChevronLeftIcon,
          ChevronRightIcon,
          EraserIcon,
          HouseIcon,
          MinusIcon,
          PaintbrushIcon,
          PaletteIcon,
          PipetteIcon,
          PlusIcon,
          Redo2Icon,
          RulerIcon,
          SaveIcon,
          Share2Icon,
          SwatchBookIcon,
          Undo2Icon,
          UsersIcon,
        },
      ],
    },
  },
}).then((world) => {
  const { camera } = world;

  // Browser view: stand on the stage at eye height, facing the intro sketch
  // signage head-on like the in-headset welcome view.
  camera.position.set(0, 1.3, 1);
  camera.rotateX(-0.08);

  setupOpenBrushShell(world);

  // Plain HTML Enter VR button: the DOM click carries the user activation
  // that XR session requests need, so it can call launchXR() directly.
  // Hidden while immersive; offer:"always" still covers browsers with
  // native Enter-VR UI.
  const enterVrButton = document.getElementById("enter-vr-button");
  if (enterVrButton) {
    enterVrButton.addEventListener("click", () => {
      world.launchXR();
    });
    world.visibilityState.subscribe((state) => {
      enterVrButton.style.display =
        state === VisibilityState.NonImmersive ? "block" : "none";
    });
  }

  const wandPanelPrism = world
    .createTransformEntity()
    .addComponent(OpenBrushPanelAttachment, {
      role: "prism",
      mode: "fixed-ring",
    });
  wandPanelPrism.object3D!.name = "OpenBrushWandPanelPrism";
  wandPanelPrism.object3D!.visible = false;

  // The color slot is a custom 3D panel (ColorPickerSystem); the other wand
  // slots are UIKit panels.
  for (const panel of [
    {
      role: "tools",
      config: "./ui/wand-tools.json",
      name: "OpenBrushWandToolsPanel",
    },
    {
      role: "brush",
      config: "./ui/wand-brush.json",
      name: "OpenBrushWandBrushPanel",
    },
  ] as const) {
    const wandPanel = world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config: panel.config,
        maxHeight: 0.42,
        maxWidth: 0.42,
      })
      .addComponent(OpenBrushPanelAttachment, {
        role: panel.role,
        mode: "fixed-ring",
      })
      .addComponent(RayInteractable);
    if (panel.role === "brush") {
      wandPanel.addComponent(OpenBrushBrushPage);
    }
    wandPanel.object3D!.name = panel.name;
    wandPanel.object3D!.visible = false;
  }

  const debugEntity = world.createTransformEntity();
  debugEntity.object3D!.name = "OpenBrushRuntimeDebug";
  debugEntity.addComponent(OpenBrushDebug);

  world
    .registerSystem(PanelSystem)
    .registerSystem(PanelAttachmentSystem)
    .registerSystem(InputCommandSystem)
    .registerSystem(BrushSizeInputSystem)
    .registerSystem(AudioFeedbackSystem)
    .registerSystem(BrushAudioSystem)
    .registerSystem(BrushCatalogSystem)
    .registerSystem(BrushPageSystem)
    .registerSystem(ColorPickerSystem)
    .registerSystem(CameraToolSystem)
    .registerSystem(EraserCursorSystem)
    .registerSystem(LayerCanvasSystem)
    .registerSystem(WorldGrabSystem)
    .registerSystem(WorldGrabVisualsSystem)
    .registerSystem(StandardEnvironmentSystem)
    .registerSystem(IntroSketchSystem)
    .registerSystem(StrokeAuthoringSystem)
    .registerSystem(BrushPointerVisualSystem)
    .registerSystem(TargetRaySpaceWebXRDebugSystem)
    .registerSystem(TipAnchorTuningSystem)
    .registerSystem(SelectionSystem)
    .registerSystem(SketchLibrarySystem)
    .registerSystem(CollabSystem)
    .registerSystem(PerformanceCounterSystem)
    .registerSystem(RuntimeDebugSystem);

  // Share links: brushspace.example/?join=123456 joins straight into the
  // peer's sketch (the in-VR path uses the keypad on the tools panel).
  const joinCode = new URLSearchParams(window.location.search).get("join");
  if (joinCode) {
    const collab = world.getSystem(CollabSystem);
    if (collab) {
      collab.autoJoinCode = joinCode;
    }
  }
});

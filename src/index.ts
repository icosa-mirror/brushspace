import {
  SessionMode,
  World,
} from "@iwsdk/core";

import {
  Interactable,
  PanelUI,
  ScreenSpace,
} from "@iwsdk/core";

import { OpenBrushDebug } from "./components/OpenBrushDebug.js";

import { PanelSystem } from "./panel.js";

import { setupOpenBrushShell } from "./openbrush/setup-shell.js";

import { BrushCatalogSystem } from "./systems/BrushCatalogSystem.js";
import { InputCommandSystem } from "./systems/InputCommandSystem.js";
import { LayerCanvasSystem } from "./systems/LayerCanvasSystem.js";
import { RuntimeDebugSystem } from "./systems/RuntimeDebugSystem.js";
import { SelectionSystem } from "./systems/SelectionSystem.js";
import { StrokeAuthoringSystem } from "./systems/StrokeAuthoringSystem.js";

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
      forwardHtmlEvents: true,
      preferredColorScheme: "dark",
    },
  },
}).then((world) => {
  const { camera } = world;

  camera.position.set(-4, 1.5, -6);
  camera.rotateY(-Math.PI * 0.75);

  setupOpenBrushShell(world);

  const panelEntity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/welcome.json",
      maxHeight: 4.75,
      maxWidth: 1.6,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: "20px",
      left: "20px",
      height: "95%",
    });
  panelEntity.object3D!.position.set(0, 2.05, -1.9);

  const debugEntity = world.createTransformEntity();
  debugEntity.object3D!.name = "OpenBrushRuntimeDebug";
  debugEntity.addComponent(OpenBrushDebug);

  world
    .registerSystem(PanelSystem)
    .registerSystem(InputCommandSystem)
    .registerSystem(BrushCatalogSystem)
    .registerSystem(LayerCanvasSystem)
    .registerSystem(StrokeAuthoringSystem)
    .registerSystem(SelectionSystem)
    .registerSystem(RuntimeDebugSystem);
});

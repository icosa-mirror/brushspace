import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  VisibilityState,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushSettings,
  CanvasLayer,
  OpenBrushAppState,
} from "./components/OpenBrushCore.js";
import {
  cycleSelectableBrush,
  openBrushInventorySummary,
  resolveSelectableBrushIndex,
  selectableOpenBrushes,
} from "./openbrush/brush-catalog.js";
import {
  createNextLayerState,
  cycleLayerIndex,
  summarizeRuntimeLayers,
  type RuntimeLayerState,
} from "./openbrush/layers.js";

type TextElement = UIKit.Text | null;

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
  brushSettings: { required: [BrushSettings] },
  appState: { required: [OpenBrushAppState] },
  layers: { required: [CanvasLayer] },
}) {
  private readonly initializedPanels = new Set<number>();

  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });
    for (const entity of this.queries.welcomePanel.entities) {
      this.setupPanel(entity);
    }
  }

  update() {
    for (const entity of this.queries.welcomePanel.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.updateBrushLabels(document);
      this.updateLayerLabels(document);
    }
  }

  private setupPanel(entity: Entity): void {
    if (this.initializedPanels.has(entity.index)) {
      return;
    }
    const document = PanelDocument.data.document[
      entity.index
    ] as UIKitDocument;
    if (!document) {
      return;
    }
    this.initializedPanels.add(entity.index);

    this.nameElement(document, "xr-button");
    this.nameElement(document, "brush-previous-button");
    this.nameElement(document, "brush-next-button");
    this.nameElement(document, "layer-new-button");
    this.nameElement(document, "layer-next-button");
    this.nameElement(document, "layer-toggle-visible-button");
    this.nameElement(document, "layer-toggle-lock-button");

    const xrButton = document.getElementById("xr-button") as TextElement;
    xrButton?.addEventListener("click", () => {
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
        this.world.launchXR();
      } else {
        this.world.exitXR();
      }
    });
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        if (visibilityState === VisibilityState.NonImmersive) {
          xrButton?.setProperties({ text: "Enter XR" });
        } else {
          xrButton?.setProperties({ text: "Exit to Browser" });
        }
      }),
    );

    const previousBrushButton = document.getElementById(
      "brush-previous-button",
    ) as TextElement;
    previousBrushButton?.addEventListener("click", () => {
      this.selectBrushOffset(-1);
    });

    const nextBrushButton = document.getElementById(
      "brush-next-button",
    ) as TextElement;
    nextBrushButton?.addEventListener("click", () => {
      this.selectBrushOffset(1);
    });

    const newLayerButton = document.getElementById(
      "layer-new-button",
    ) as TextElement;
    newLayerButton?.addEventListener("click", () => {
      this.createLayer();
    });

    const nextLayerButton = document.getElementById(
      "layer-next-button",
    ) as TextElement;
    nextLayerButton?.addEventListener("click", () => {
      this.selectLayerOffset(1);
    });

    const visibilityButton = document.getElementById(
      "layer-toggle-visible-button",
    ) as TextElement;
    visibilityButton?.addEventListener("click", () => {
      this.toggleActiveLayerVisibility();
    });

    const lockButton = document.getElementById(
      "layer-toggle-lock-button",
    ) as TextElement;
    lockButton?.addEventListener("click", () => {
      this.toggleActiveLayerLock();
    });
    this.updateBrushLabels(document);
    this.updateLayerLabels(document);
  }

  private selectBrushOffset(offset: number): void {
    const settingsEntity = this.getBrushSettingsEntity();
    if (!settingsEntity) {
      return;
    }
    const currentBrushGuid = String(
      settingsEntity.getValue(BrushSettings, "brushGuid"),
    );
    const nextBrush = cycleSelectableBrush(currentBrushGuid, offset);
    settingsEntity.setValue(BrushSettings, "brushGuid", nextBrush.guid);
  }

  private updateBrushLabels(document: UIKitDocument): void {
    const settingsEntity = this.getBrushSettingsEntity();
    const activeBrushGuid = settingsEntity
      ? String(settingsEntity.getValue(BrushSettings, "brushGuid"))
      : "";
    const activeIndex = resolveSelectableBrushIndex(activeBrushGuid);
    const activeBrush = selectableOpenBrushes[activeIndex];
    const catalogPosition = `${activeIndex + 1}/${selectableOpenBrushes.length}`;

    this.setText(document, "active-brush-name", activeBrush?.name ?? "No brush");
    this.setText(
      document,
      "active-brush-meta",
      activeBrush
        ? `${activeBrush.geometryFamily} / ${activeBrush.materialFamily} / ${catalogPosition}`
        : "unavailable",
    );
    this.setText(
      document,
      "brush-catalog-counts",
      `${openBrushInventorySummary.supported} supported | ${openBrushInventorySummary.fallback} fallback | ${openBrushInventorySummary.unsupported} pending`,
    );
    this.setText(
      document,
      "brush-warning",
      activeBrush?.unsupportedReason ?? "Ready",
    );
  }

  private createLayer(): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }

    const nextLayer = createNextLayerState(this.getLayerStates());
    const layerEntity = this.world.createTransformEntity().addComponent(CanvasLayer, {
      layerIndex: nextLayer.layerIndex,
      layerName: nextLayer.layerName,
      visible: true,
      locked: false,
      selectionCanvas: false,
      active: true,
    });
    layerEntity.object3D!.name = `OpenBrushLayer_${nextLayer.layerIndex}`;
    this.setActiveLayerIndex(nextLayer.layerIndex);
  }

  private selectLayerOffset(offset: number): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const activeLayerIndex = Number(
      appState.getValue(OpenBrushAppState, "activeLayerIndex"),
    );
    this.setActiveLayerIndex(
      cycleLayerIndex(this.getLayerStates(), activeLayerIndex, offset),
    );
  }

  private toggleActiveLayerVisibility(): void {
    const layer = this.getActiveLayerEntity();
    if (!layer) {
      return;
    }
    layer.setValue(
      CanvasLayer,
      "visible",
      !Boolean(layer.getValue(CanvasLayer, "visible")),
    );
    this.touchAppState();
  }

  private toggleActiveLayerLock(): void {
    const layer = this.getActiveLayerEntity();
    if (!layer) {
      return;
    }
    layer.setValue(
      CanvasLayer,
      "locked",
      !Boolean(layer.getValue(CanvasLayer, "locked")),
    );
    this.touchAppState();
  }

  private setActiveLayerIndex(layerIndex: number): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    appState.setValue(OpenBrushAppState, "activeLayerIndex", layerIndex);
    this.touchAppState(appState);
    for (const layer of this.queries.layers.entities) {
      layer.setValue(
        CanvasLayer,
        "active",
        !layer.getValue(CanvasLayer, "selectionCanvas") &&
          Number(layer.getValue(CanvasLayer, "layerIndex")) === layerIndex,
      );
    }
  }

  private updateLayerLabels(document: UIKitDocument): void {
    const appState = this.getAppStateEntity();
    const activeLayerIndex = appState
      ? Number(appState.getValue(OpenBrushAppState, "activeLayerIndex"))
      : 0;
    const summary = summarizeRuntimeLayers(this.getLayerStates(), activeLayerIndex);
    this.setText(document, "active-layer-name", summary.activeLayerName);
    this.setText(
      document,
      "active-layer-meta",
      `Layer ${summary.activeLayerIndex} | ${summary.paintLayerCount} paint / ${summary.selectionLayerCount} selection`,
    );
    this.setText(
      document,
      "layer-state",
      `${summary.activeLayerVisible ? "Visible" : "Hidden"} | ${
        summary.activeLayerLocked ? "Locked" : "Unlocked"
      }`,
    );
    this.setText(
      document,
      "layer-toggle-visible-button",
      summary.activeLayerVisible ? "Hide" : "Show",
    );
    this.setText(
      document,
      "layer-toggle-lock-button",
      summary.activeLayerLocked ? "Unlock" : "Lock",
    );
  }

  private setText(document: UIKitDocument, id: string, text: string): void {
    const element = document.getElementById(id) as TextElement;
    element?.setProperties({ text });
  }

  private nameElement(document: UIKitDocument, id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.name = id;
    }
  }

  private getBrushSettingsEntity(): Entity | undefined {
    const next = this.queries.brushSettings.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getAppStateEntity(): Entity | undefined {
    const next = this.queries.appState.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getActiveLayerEntity(): Entity | undefined {
    const appState = this.getAppStateEntity();
    const activeLayerIndex = appState
      ? Number(appState.getValue(OpenBrushAppState, "activeLayerIndex"))
      : 0;
    for (const layer of this.queries.layers.entities) {
      if (
        !layer.getValue(CanvasLayer, "selectionCanvas") &&
        Number(layer.getValue(CanvasLayer, "layerIndex")) === activeLayerIndex
      ) {
        return layer;
      }
    }
    return undefined;
  }

  private getLayerStates(): RuntimeLayerState[] {
    const layers: RuntimeLayerState[] = [];
    for (const layer of this.queries.layers.entities) {
      layers.push({
        layerIndex: Number(layer.getValue(CanvasLayer, "layerIndex")),
        layerName: String(layer.getValue(CanvasLayer, "layerName")),
        visible: Boolean(layer.getValue(CanvasLayer, "visible")),
        locked: Boolean(layer.getValue(CanvasLayer, "locked")),
        selectionCanvas: Boolean(layer.getValue(CanvasLayer, "selectionCanvas")),
        active: Boolean(layer.getValue(CanvasLayer, "active")),
      });
    }
    return layers;
  }

  private touchAppState(appState = this.getAppStateEntity()): void {
    if (!appState) {
      return;
    }
    appState.setValue(OpenBrushAppState, "isDirty", true);
    appState.setValue(
      OpenBrushAppState,
      "commandRevision",
      Number(appState.getValue(OpenBrushAppState, "commandRevision")) + 1,
    );
  }
}

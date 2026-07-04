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
  BrushStroke,
  CanvasLayer,
  OpenBrushAppState,
  SelectionState,
  UiCommandHistoryState,
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
  reorderLayerStates,
  summarizeRuntimeLayers,
  type RuntimeLayerState,
} from "./openbrush/layers.js";
import {
  resolveLastSelectableStroke,
  type RuntimeStrokeSelectionState,
} from "./openbrush/selection.js";
import {
  resolveOpenBrushTool,
  type OpenBrushToolId,
} from "./openbrush/tools.js";
import {
  UiCommandHistory,
  type UiCommand,
} from "./openbrush/ui-command-history.js";

type TextElement = UIKit.Text | null;
type LayerOrderSnapshot = Array<{ layerIndex: number; order: number }>;
interface StrokePanelSnapshot {
  entity: Entity;
  visible: boolean;
  renderVisible: boolean;
  selected: boolean;
}

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
  brushSettings: { required: [BrushSettings] },
  appState: { required: [OpenBrushAppState] },
  selectionState: { required: [SelectionState] },
  uiHistory: { required: [UiCommandHistoryState] },
  layers: { required: [CanvasLayer] },
  strokes: { required: [BrushStroke] },
}) {
  private readonly initializedPanels = new Set<number>();
  private readonly commandHistory = new UiCommandHistory();

  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });
    for (const entity of this.queries.welcomePanel.entities) {
      this.setupPanel(entity);
    }
  }

  update() {
    this.updateUiCommandHistoryState();
    for (const entity of this.queries.welcomePanel.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.updateBrushLabels(document);
      this.updateToolLabels(document);
      this.updateLayerLabels(document);
      this.updateSelectionLabels(document);
      this.updateHistoryLabels(document);
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
    this.nameElement(document, "history-undo-button");
    this.nameElement(document, "history-redo-button");
    this.nameElement(document, "tool-draw-button");
    this.nameElement(document, "tool-eraser-button");
    this.nameElement(document, "tool-straightedge-button");
    this.nameElement(document, "tool-mirror-button");
    this.nameElement(document, "tool-grid-snap-button");
    this.nameElement(document, "tool-color-picker-button");
    this.nameElement(document, "tool-brush-picker-button");
    this.nameElement(document, "tool-pick-button");
    this.nameElement(document, "tool-erase-button");
    this.nameElement(document, "brush-previous-button");
    this.nameElement(document, "brush-next-button");
    this.nameElement(document, "layer-new-button");
    this.nameElement(document, "layer-next-button");
    this.nameElement(document, "layer-toggle-visible-button");
    this.nameElement(document, "layer-toggle-lock-button");
    this.nameElement(document, "layer-move-up-button");
    this.nameElement(document, "layer-move-down-button");
    this.nameElement(document, "layer-clear-button");
    this.nameElement(document, "selection-select-last-button");
    this.nameElement(document, "selection-clear-button");

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

    const undoButton = document.getElementById(
      "history-undo-button",
    ) as TextElement;
    undoButton?.addEventListener("click", () => {
      this.undoUiCommand();
    });

    const redoButton = document.getElementById(
      "history-redo-button",
    ) as TextElement;
    redoButton?.addEventListener("click", () => {
      this.redoUiCommand();
    });

    const drawToolButton = document.getElementById(
      "tool-draw-button",
    ) as TextElement;
    drawToolButton?.addEventListener("click", () => {
      this.selectTool("free-paint");
    });

    const eraserToolButton = document.getElementById(
      "tool-eraser-button",
    ) as TextElement;
    eraserToolButton?.addEventListener("click", () => {
      this.selectTool("eraser");
    });

    const straightedgeToolButton = document.getElementById(
      "tool-straightedge-button",
    ) as TextElement;
    straightedgeToolButton?.addEventListener("click", () => {
      this.selectTool("straightedge");
    });

    const mirrorToolButton = document.getElementById(
      "tool-mirror-button",
    ) as TextElement;
    mirrorToolButton?.addEventListener("click", () => {
      this.selectTool("mirror");
    });

    const gridSnapToolButton = document.getElementById(
      "tool-grid-snap-button",
    ) as TextElement;
    gridSnapToolButton?.addEventListener("click", () => {
      this.selectTool("grid-snap");
    });

    const colorPickerToolButton = document.getElementById(
      "tool-color-picker-button",
    ) as TextElement;
    colorPickerToolButton?.addEventListener("click", () => {
      this.selectTool("color-picker");
    });

    const brushPickerToolButton = document.getElementById(
      "tool-brush-picker-button",
    ) as TextElement;
    brushPickerToolButton?.addEventListener("click", () => {
      this.selectTool("brush-picker");
    });

    const pickButton = document.getElementById("tool-pick-button") as TextElement;
    pickButton?.addEventListener("click", () => {
      this.pickFromActiveTool();
    });

    const eraseButton = document.getElementById(
      "tool-erase-button",
    ) as TextElement;
    eraseButton?.addEventListener("click", () => {
      this.eraseWithActiveTool();
    });

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

    const moveUpButton = document.getElementById(
      "layer-move-up-button",
    ) as TextElement;
    moveUpButton?.addEventListener("click", () => {
      this.moveActiveLayer(-1);
    });

    const moveDownButton = document.getElementById(
      "layer-move-down-button",
    ) as TextElement;
    moveDownButton?.addEventListener("click", () => {
      this.moveActiveLayer(1);
    });

    const clearLayerButton = document.getElementById(
      "layer-clear-button",
    ) as TextElement;
    clearLayerButton?.addEventListener("click", () => {
      this.clearActiveLayer();
    });

    const selectLastButton = document.getElementById(
      "selection-select-last-button",
    ) as TextElement;
    selectLastButton?.addEventListener("click", () => {
      this.selectLastStrokeOnActiveLayer();
    });

    const clearSelectionButton = document.getElementById(
      "selection-clear-button",
    ) as TextElement;
    clearSelectionButton?.addEventListener("click", () => {
      this.clearSelection();
    });
    this.updateBrushLabels(document);
    this.updateToolLabels(document);
    this.updateLayerLabels(document);
    this.updateSelectionLabels(document);
    this.updateHistoryLabels(document);
  }

  private selectTool(toolId: OpenBrushToolId): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const currentTool = resolveOpenBrushTool(
      String(appState.getValue(OpenBrushAppState, "activeTool")),
    );
    const nextTool = resolveOpenBrushTool(toolId);
    if (currentTool.id === nextTool.id) {
      this.setToolStatus(appState, nextTool.status);
      return;
    }

    appState.setValue(OpenBrushAppState, "previousTool", currentTool.id);
    appState.setValue(OpenBrushAppState, "activeTool", nextTool.id);
    appState.setValue(OpenBrushAppState, "toolStatus", nextTool.status);
    this.touchToolState(appState);
  }

  private eraseWithActiveTool(): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const activeTool = resolveOpenBrushTool(
      String(appState.getValue(OpenBrushAppState, "activeTool")),
    );
    if (!activeTool.erases) {
      this.selectTool("eraser");
    }

    const targets = this.getEraserTargetSnapshots(
      this.getActiveLayerIndex(appState),
    );
    if (targets.length === 0) {
      this.setToolStatus(appState, "nothing-to-erase");
      return;
    }

    const erasedLabel =
      targets.length === 1
        ? "erased 1 stroke"
        : `erased ${targets.length} strokes`;
    this.executeUiCommand({
      name: "erase-strokes",
      redo: () => {
        for (const stroke of targets) {
          this.applyStrokeSnapshot({
            ...stroke,
            visible: false,
            renderVisible: false,
            selected: false,
          });
        }
        this.setToolStatus(appState, erasedLabel);
        this.touchSelectionState();
        this.touchAppState(appState);
      },
      undo: () => {
        for (const stroke of targets) {
          this.applyStrokeSnapshot(stroke);
        }
        this.setToolStatus(appState, "erase-undone");
        this.touchSelectionState();
        this.touchAppState(appState);
      },
    });
  }

  private pickFromActiveTool(): void {
    const appState = this.getAppStateEntity();
    const settingsEntity = this.getBrushSettingsEntity();
    if (!appState || !settingsEntity) {
      return;
    }

    const activeTool = resolveOpenBrushTool(
      String(appState.getValue(OpenBrushAppState, "activeTool")),
    );
    if (activeTool.id !== "color-picker" && activeTool.id !== "brush-picker") {
      this.setToolStatus(appState, "choose-picker");
      return;
    }

    const target = this.getPickerTargetStroke(this.getActiveLayerIndex(appState));
    if (!target) {
      this.setToolStatus(appState, "nothing-to-pick");
      return;
    }

    const commandIndex = Number(target.getValue(BrushStroke, "commandIndex"));
    if (activeTool.id === "color-picker") {
      const sourceColor = target.getVectorView(
        BrushStroke,
        "color",
      ) as Float32Array;
      const settingsColor = settingsEntity.getVectorView(
        BrushSettings,
        "color",
      ) as Float32Array;
      settingsColor[0] = sourceColor[0];
      settingsColor[1] = sourceColor[1];
      settingsColor[2] = sourceColor[2];
      settingsColor[3] = sourceColor[3];
      this.setToolStatus(appState, `picked color #${commandIndex}`, true);
      return;
    }

    settingsEntity.setValue(
      BrushSettings,
      "brushGuid",
      String(target.getValue(BrushStroke, "brushGuid")),
    );
    this.setToolStatus(appState, `picked brush #${commandIndex}`, true);
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

  private updateToolLabels(document: UIKitDocument): void {
    const appState = this.getAppStateEntity();
    const activeTool = resolveOpenBrushTool(
      appState ? String(appState.getValue(OpenBrushAppState, "activeTool")) : "",
    );
    const toolStatus = appState
      ? String(appState.getValue(OpenBrushAppState, "toolStatus"))
      : activeTool.status;

    this.setText(document, "active-tool-name", activeTool.label);
    this.setText(document, "active-tool-state", toolStatus);
    this.setText(
      document,
      "tool-draw-button",
      activeTool.id === "free-paint" ? "Draw *" : "Draw",
    );
    this.setText(
      document,
      "tool-eraser-button",
      activeTool.id === "eraser" ? "Eraser *" : "Eraser",
    );
    this.setText(
      document,
      "tool-straightedge-button",
      activeTool.id === "straightedge" ? "Line *" : "Line",
    );
    this.setText(
      document,
      "tool-mirror-button",
      activeTool.id === "mirror" ? "Mirror *" : "Mirror",
    );
    this.setText(
      document,
      "tool-grid-snap-button",
      activeTool.id === "grid-snap" ? "Grid *" : "Grid",
    );
    this.setText(
      document,
      "tool-color-picker-button",
      activeTool.id === "color-picker" ? "Color *" : "Color",
    );
    this.setText(
      document,
      "tool-brush-picker-button",
      activeTool.id === "brush-picker" ? "Brush *" : "Brush",
    );
    this.setText(
      document,
      "tool-pick-button",
      activeTool.id === "color-picker"
        ? "Pick Color"
        : activeTool.id === "brush-picker"
          ? "Pick Brush"
          : "Pick Target",
    );
  }

  private createLayer(): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }

    const previousLayerIndex = this.getActiveLayerIndex(appState);
    const nextLayer = createNextLayerState(this.getLayerStates());
    let layerEntity: Entity | undefined;

    this.executeUiCommand({
      name: "create-layer",
      redo: () => {
        layerEntity = this.createLayerEntity(nextLayer);
        this.setActiveLayerIndex(nextLayer.layerIndex);
      },
      undo: () => {
        if (layerEntity) {
          layerEntity.dispose();
          layerEntity = undefined;
        }
        this.setActiveLayerIndex(previousLayerIndex);
      },
    });
  }

  private selectLayerOffset(offset: number): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const activeLayerIndex = Number(
      appState.getValue(OpenBrushAppState, "activeLayerIndex"),
    );
    const nextLayerIndex = cycleLayerIndex(
      this.getLayerStates(),
      activeLayerIndex,
      offset,
    );
    if (nextLayerIndex === activeLayerIndex) {
      return;
    }
    this.executeUiCommand({
      name: "select-layer",
      redo: () => {
        this.setActiveLayerIndex(nextLayerIndex);
      },
      undo: () => {
        this.setActiveLayerIndex(activeLayerIndex);
      },
    });
  }

  private moveActiveLayer(offset: number): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const activeLayerIndex = this.getActiveLayerIndex(appState);
    const previousOrders = this.getLayerOrderSnapshot();
    const reorderedLayers = reorderLayerStates(
      this.getLayerStates(),
      activeLayerIndex,
      offset,
    );
    const nextOrders = reorderedLayers.map((layer) => ({
      layerIndex: layer.layerIndex,
      order: layer.order,
    }));
    if (this.layerOrdersMatch(previousOrders, nextOrders)) {
      return;
    }

    this.executeUiCommand({
      name: offset < 0 ? "move-layer-up" : "move-layer-down",
      redo: () => {
        this.applyLayerOrders(nextOrders);
      },
      undo: () => {
        this.applyLayerOrders(previousOrders);
      },
    });
  }

  private clearActiveLayer(): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const activeLayerIndex = this.getActiveLayerIndex(appState);
    const previousStrokes = this.getLayerStrokeSnapshots(activeLayerIndex);
    if (
      !previousStrokes.some(
        (stroke) => stroke.visible || stroke.renderVisible || stroke.selected,
      )
    ) {
      return;
    }
    this.executeUiCommand({
      name: "clear-layer",
      redo: () => {
        for (const stroke of previousStrokes) {
          this.applyStrokeSnapshot({
            ...stroke,
            visible: false,
            renderVisible: false,
            selected: false,
          });
        }
        this.touchSelectionState();
        this.touchAppState(appState);
      },
      undo: () => {
        for (const stroke of previousStrokes) {
          this.applyStrokeSnapshot(stroke);
        }
        this.touchSelectionState();
        this.touchAppState(appState);
      },
    });
  }

  private selectLastStrokeOnActiveLayer(): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const target = resolveLastSelectableStroke(
      this.getStrokeSelectionStates(),
      this.getActiveLayerIndex(appState),
    );
    if (!target) {
      return;
    }

    const previousSelection = this.getSelectedCommandIndices();
    const nextSelection = [target.commandIndex];
    if (this.sameCommandIndexSet(previousSelection, nextSelection)) {
      return;
    }
    this.executeUiCommand({
      name: "select-last-stroke",
      redo: () => {
        this.restoreSelectedCommandIndices(nextSelection);
        this.touchSelectionState();
        this.touchAppState(appState);
      },
      undo: () => {
        this.restoreSelectedCommandIndices(previousSelection);
        this.touchSelectionState();
        this.touchAppState(appState);
      },
    });
  }

  private clearSelection(): void {
    const previousSelection = this.getSelectedCommandIndices();
    if (previousSelection.length === 0) {
      return;
    }
    this.executeUiCommand({
      name: "clear-selection",
      redo: () => {
        this.restoreSelectedCommandIndices([]);
        this.touchSelectionState();
        this.touchAppState();
      },
      undo: () => {
        this.restoreSelectedCommandIndices(previousSelection);
        this.touchSelectionState();
        this.touchAppState();
      },
    });
  }

  private toggleActiveLayerVisibility(): void {
    const layer = this.getActiveLayerEntity();
    if (!layer) {
      return;
    }
    const layerIndex = Number(layer.getValue(CanvasLayer, "layerIndex"));
    const previousVisible = Boolean(layer.getValue(CanvasLayer, "visible"));
    this.executeUiCommand({
      name: previousVisible ? "hide-layer" : "show-layer",
      redo: () => {
        this.setLayerBoolean(layerIndex, "visible", !previousVisible);
      },
      undo: () => {
        this.setLayerBoolean(layerIndex, "visible", previousVisible);
      },
    });
  }

  private toggleActiveLayerLock(): void {
    const layer = this.getActiveLayerEntity();
    if (!layer) {
      return;
    }
    const layerIndex = Number(layer.getValue(CanvasLayer, "layerIndex"));
    const previousLocked = Boolean(layer.getValue(CanvasLayer, "locked"));
    this.executeUiCommand({
      name: previousLocked ? "unlock-layer" : "lock-layer",
      redo: () => {
        this.setLayerBoolean(layerIndex, "locked", !previousLocked);
      },
      undo: () => {
        this.setLayerBoolean(layerIndex, "locked", previousLocked);
      },
    });
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
      `Layer ${summary.activeLayerIndex} | order ${
        summary.activeLayerOrder + 1
      }/${summary.paintLayerCount} | ${summary.selectionLayerCount} selection`,
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

  private updateSelectionLabels(document: UIKitDocument): void {
    const selectionState = this.getSelectionStateEntity();
    const selectedStrokeCount = selectionState
      ? Number(selectionState.getValue(SelectionState, "selectedStrokeCount"))
      : 0;
    const activeSelectionLayerIndex = selectionState
      ? Number(
          selectionState.getValue(SelectionState, "activeSelectionLayerIndex"),
        )
      : -1;
    const lastSelectedStrokeCommandIndex = selectionState
      ? Number(
          selectionState.getValue(
            SelectionState,
            "lastSelectedStrokeCommandIndex",
          ),
        )
      : 0;

    if (selectedStrokeCount === 0) {
      this.setText(document, "selection-state", "No selection");
      return;
    }

    const layerLabel =
      activeSelectionLayerIndex >= 0
        ? `Layer ${activeSelectionLayerIndex}`
        : "Mixed layers";
    this.setText(
      document,
      "selection-state",
      `${selectedStrokeCount} selected | ${layerLabel} | #${lastSelectedStrokeCommandIndex}`,
    );
  }

  private updateHistoryLabels(document: UIKitDocument): void {
    const summary = this.commandHistory.summarize();
    this.setText(
      document,
      "history-state",
      `${summary.undoDepth} undo | ${summary.redoDepth} redo`,
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

  private getSelectionStateEntity(): Entity | undefined {
    const next = this.queries.selectionState.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getUiCommandHistoryEntity(): Entity | undefined {
    const next = this.queries.uiHistory.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getActiveLayerEntity(): Entity | undefined {
    const activeLayerIndex = this.getActiveLayerIndex();
    return this.getLayerEntity(activeLayerIndex);
  }

  private getLayerEntity(layerIndex: number): Entity | undefined {
    for (const layer of this.queries.layers.entities) {
      if (
        !layer.getValue(CanvasLayer, "selectionCanvas") &&
        Number(layer.getValue(CanvasLayer, "layerIndex")) === layerIndex
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
        order: Number(layer.getValue(CanvasLayer, "order")),
        layerName: String(layer.getValue(CanvasLayer, "layerName")),
        visible: Boolean(layer.getValue(CanvasLayer, "visible")),
        locked: Boolean(layer.getValue(CanvasLayer, "locked")),
        selectionCanvas: Boolean(layer.getValue(CanvasLayer, "selectionCanvas")),
        active: Boolean(layer.getValue(CanvasLayer, "active")),
      });
    }
    return layers;
  }

  private getStrokeSelectionStates(): RuntimeStrokeSelectionState[] {
    const strokes: RuntimeStrokeSelectionState[] = [];
    for (const stroke of this.queries.strokes.entities) {
      strokes.push({
        layerIndex: Number(stroke.getValue(BrushStroke, "layerIndex")),
        commandIndex: Number(stroke.getValue(BrushStroke, "commandIndex")),
        visible: Boolean(stroke.getValue(BrushStroke, "visible")),
        renderVisible: Boolean(stroke.getValue(BrushStroke, "renderVisible")),
        finalized: Boolean(stroke.getValue(BrushStroke, "finalized")),
        selected: Boolean(stroke.getValue(BrushStroke, "selected")),
      });
    }
    return strokes;
  }

  private createLayerEntity(layerState: RuntimeLayerState): Entity {
    const layerEntity = this.world.createTransformEntity().addComponent(CanvasLayer, {
      layerIndex: layerState.layerIndex,
      order: layerState.order,
      layerName: layerState.layerName,
      visible: layerState.visible,
      locked: layerState.locked,
      selectionCanvas: layerState.selectionCanvas,
      active: layerState.active,
    });
    layerEntity.object3D!.name = `OpenBrushLayer_${layerState.layerIndex}`;
    return layerEntity;
  }

  private getLayerOrderSnapshot(): LayerOrderSnapshot {
    return this.getLayerStates().map((layer) => ({
      layerIndex: layer.layerIndex,
      order: layer.order,
    }));
  }

  private applyLayerOrders(snapshot: LayerOrderSnapshot): void {
    for (const layerState of snapshot) {
      const layerEntity = this.getLayerEntity(layerState.layerIndex);
      if (
        layerEntity &&
        Number(layerEntity.getValue(CanvasLayer, "order")) !== layerState.order
      ) {
        layerEntity.setValue(CanvasLayer, "order", layerState.order);
      }
    }
    this.touchAppState();
  }

  private layerOrdersMatch(
    left: LayerOrderSnapshot,
    right: LayerOrderSnapshot,
  ): boolean {
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (
        left[index].layerIndex !== right[index].layerIndex ||
        left[index].order !== right[index].order
      ) {
        return false;
      }
    }
    return true;
  }

  private getLayerStrokeSnapshots(layerIndex: number): StrokePanelSnapshot[] {
    const strokes: StrokePanelSnapshot[] = [];
    for (const stroke of this.queries.strokes.entities) {
      if (Number(stroke.getValue(BrushStroke, "layerIndex")) !== layerIndex) {
        continue;
      }
      strokes.push({
        entity: stroke,
        visible: Boolean(stroke.getValue(BrushStroke, "visible")),
        renderVisible: Boolean(stroke.getValue(BrushStroke, "renderVisible")),
        selected: Boolean(stroke.getValue(BrushStroke, "selected")),
      });
    }
    return strokes;
  }

  private getEraserTargetSnapshots(layerIndex: number): StrokePanelSnapshot[] {
    const selectedStrokes = this.getVisibleSelectedStrokeSnapshots();
    if (selectedStrokes.length > 0) {
      return selectedStrokes;
    }
    const newestStroke = this.getNewestVisibleStrokeSnapshot(layerIndex);
    return newestStroke ? [newestStroke] : [];
  }

  private getVisibleSelectedStrokeSnapshots(): StrokePanelSnapshot[] {
    const strokes: StrokePanelSnapshot[] = [];
    for (const stroke of this.queries.strokes.entities) {
      if (
        !stroke.getValue(BrushStroke, "selected") ||
        !stroke.getValue(BrushStroke, "visible") ||
        !stroke.getValue(BrushStroke, "renderVisible")
      ) {
        continue;
      }
      strokes.push({
        entity: stroke,
        visible: true,
        renderVisible: true,
        selected: true,
      });
    }
    return strokes;
  }

  private getPickerTargetStroke(layerIndex: number): Entity | undefined {
    let newestSelectedStroke: Entity | undefined;
    let newestSelectedCommandIndex = -1;
    for (const stroke of this.getVisibleSelectedStrokeSnapshots()) {
      const commandIndex = Number(
        stroke.entity.getValue(BrushStroke, "commandIndex"),
      );
      if (commandIndex > newestSelectedCommandIndex) {
        newestSelectedCommandIndex = commandIndex;
        newestSelectedStroke = stroke.entity;
      }
    }
    return (
      newestSelectedStroke ?? this.getNewestVisibleStrokeSnapshot(layerIndex)?.entity
    );
  }

  private getNewestVisibleStrokeSnapshot(
    layerIndex: number,
  ): StrokePanelSnapshot | undefined {
    let newestStroke: Entity | undefined;
    let newestCommandIndex = -1;
    for (const stroke of this.queries.strokes.entities) {
      if (
        Number(stroke.getValue(BrushStroke, "layerIndex")) !== layerIndex ||
        !stroke.getValue(BrushStroke, "finalized") ||
        !stroke.getValue(BrushStroke, "visible") ||
        !stroke.getValue(BrushStroke, "renderVisible")
      ) {
        continue;
      }
      const commandIndex = Number(stroke.getValue(BrushStroke, "commandIndex"));
      if (commandIndex > newestCommandIndex) {
        newestCommandIndex = commandIndex;
        newestStroke = stroke;
      }
    }
    return newestStroke
      ? {
          entity: newestStroke,
          visible: true,
          renderVisible: true,
          selected: Boolean(newestStroke.getValue(BrushStroke, "selected")),
        }
      : undefined;
  }

  private applyStrokeSnapshot(snapshot: StrokePanelSnapshot): void {
    snapshot.entity.setValue(BrushStroke, "visible", snapshot.visible);
    snapshot.entity.setValue(
      BrushStroke,
      "renderVisible",
      snapshot.renderVisible,
    );
    snapshot.entity.setValue(BrushStroke, "selected", snapshot.selected);
    if (snapshot.entity.object3D) {
      snapshot.entity.object3D.visible = snapshot.renderVisible;
    }
  }

  private getSelectedCommandIndices(): number[] {
    const selected: number[] = [];
    for (const stroke of this.queries.strokes.entities) {
      if (stroke.getValue(BrushStroke, "selected")) {
        selected.push(Number(stroke.getValue(BrushStroke, "commandIndex")));
      }
    }
    return selected.sort((a, b) => a - b);
  }

  private restoreSelectedCommandIndices(commandIndices: number[]): void {
    const selected = new Set(commandIndices);
    for (const stroke of this.queries.strokes.entities) {
      stroke.setValue(
        BrushStroke,
        "selected",
        selected.has(Number(stroke.getValue(BrushStroke, "commandIndex"))),
      );
    }
  }

  private sameCommandIndexSet(left: number[], right: number[]): boolean {
    if (left.length !== right.length) {
      return false;
    }
    const sortedLeft = [...left].sort((a, b) => a - b);
    const sortedRight = [...right].sort((a, b) => a - b);
    for (let index = 0; index < sortedLeft.length; index += 1) {
      if (sortedLeft[index] !== sortedRight[index]) {
        return false;
      }
    }
    return true;
  }

  private setLayerBoolean(
    layerIndex: number,
    field: "visible" | "locked",
    value: boolean,
  ): void {
    const layer = this.getLayerEntity(layerIndex);
    if (!layer) {
      return;
    }
    layer.setValue(CanvasLayer, field, value);
    this.touchAppState();
  }

  private setToolStatus(
    appState: Entity,
    status: string,
    forceRevision = false,
  ): void {
    if (String(appState.getValue(OpenBrushAppState, "toolStatus")) === status) {
      if (forceRevision) {
        this.touchToolState(appState);
      }
      return;
    }
    appState.setValue(OpenBrushAppState, "toolStatus", status);
    this.touchToolState(appState);
  }

  private touchToolState(appState: Entity): void {
    appState.setValue(
      OpenBrushAppState,
      "toolRevision",
      Number(appState.getValue(OpenBrushAppState, "toolRevision")) + 1,
    );
    appState.setValue(
      OpenBrushAppState,
      "commandRevision",
      Number(appState.getValue(OpenBrushAppState, "commandRevision")) + 1,
    );
  }

  private getActiveLayerIndex(appState = this.getAppStateEntity()): number {
    return appState
      ? Number(appState.getValue(OpenBrushAppState, "activeLayerIndex"))
      : 0;
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

  private touchSelectionState(
    selectionState = this.getSelectionStateEntity(),
  ): void {
    if (!selectionState) {
      return;
    }
    selectionState.setValue(
      SelectionState,
      "selectionRevision",
      Number(selectionState.getValue(SelectionState, "selectionRevision")) + 1,
    );
  }

  private executeUiCommand(command: UiCommand): void {
    this.commandHistory.execute(command);
    this.updateUiCommandHistoryState();
  }

  private undoUiCommand(): void {
    if (this.commandHistory.undo()) {
      this.updateUiCommandHistoryState();
    }
  }

  private redoUiCommand(): void {
    if (this.commandHistory.redo()) {
      this.updateUiCommandHistoryState();
    }
  }

  private updateUiCommandHistoryState(
    entity = this.getUiCommandHistoryEntity(),
  ): void {
    if (!entity) {
      return;
    }
    const summary = this.commandHistory.summarize();
    entity.setValue(UiCommandHistoryState, "undoDepth", summary.undoDepth);
    entity.setValue(UiCommandHistoryState, "redoDepth", summary.redoDepth);
    entity.setValue(
      UiCommandHistoryState,
      "historyRevision",
      summary.historyRevision,
    );
    entity.setValue(
      UiCommandHistoryState,
      "lastCommandName",
      summary.lastCommandName,
    );
  }
}

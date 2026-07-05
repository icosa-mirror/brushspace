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
  OpenBrushEraserCursor,
  PlaybackState,
  PersistenceState,
  SelectionState,
  SettingsState,
  StrokeHistoryState,
  UiCommandHistoryState,
} from "./components/OpenBrushCore.js";
import {
  cycleSelectableBrush,
  openBrushInventory,
  openBrushInventorySummary,
  resolveSelectableBrushIndex,
  selectableOpenBrushes,
} from "./openbrush/brush-catalog.js";
import {
  OPEN_BRUSH_BRUSH_SIZE_BUTTON_STEP,
  OPEN_BRUSH_DEFAULT_SIZE01,
  brushSize01ToLiveBrushSize,
  liveBrushSizeToSize01,
  normalizeBrushSize01,
  resolveBrushSize01Adjustment,
} from "./openbrush/brush-size.js";
import { findBrushByGuid } from "./openbrush/brush-inventory.js";
import {
  createNextLayerState,
  cycleLayerIndex,
  reorderLayerStates,
  summarizeRuntimeLayers,
  type RuntimeLayerState,
} from "./openbrush/layers.js";
import {
  planSelectedStrokeTranslation,
  resolveLastSelectableStroke,
  type RuntimeStrokeTransformState,
  type RuntimeStrokeSelectionState,
} from "./openbrush/selection.js";
import {
  OPEN_BRUSH_ERASER_SIZE_BUTTON_STEP01,
  isOpenBrushPanelFocusStatus,
  openBrushEraserRadiusToSize01,
  resolveOpenBrushPickerToolSpec,
  resolveOpenBrushTool,
  resolveOpenBrushEraserSizeAdjustment,
  type OpenBrushToolId,
} from "./openbrush/tools.js";
import {
  isStraightEdgeModeActive,
  resolveEffectiveOpenBrushTool,
} from "./openbrush/tool-modes.js";
import { formatOpenBrushSizeMeters } from "./openbrush/size-labels.js";
import {
  UiCommandHistory,
  type UiCommand,
} from "./openbrush/ui-command-history.js";
import {
  normalizeOpenBrushSettings,
  resolveOpenBrushSettingsCommand,
  type OpenBrushLocomotionMode,
  type OpenBrushPanelAnchor,
  type OpenBrushSettings,
  type OpenBrushSettingsCommand,
} from "./openbrush/settings.js";

type TextElement = UIKit.Text | null;
type LayerOrderSnapshot = Array<{ layerIndex: number; order: number }>;
interface StrokePanelSnapshot {
  entity: Entity;
  visible: boolean;
  renderVisible: boolean;
  selected: boolean;
}
interface StrokeTransformSnapshot {
  entity: Entity;
  commandIndex: number;
  position: [number, number, number];
}
interface RuntimeSketchMetrics {
  layerCount: number;
  strokeCount: number;
  controlPointCount: number;
  tiltByteLength: number;
  glbByteLength: number;
}

const SELECTION_NUDGE_DISTANCE = 0.1;
const PANEL_SCALE_STEP = 0.1;
const PANEL_DISTANCE_STEP = 0.1;
const PANEL_ANCHORS: readonly OpenBrushPanelAnchor[] = [
  "off-hand",
  "dominant-hand",
  "center",
];
const PLAYBACK_MODES = ["quickload", "timestamp", "distance"] as const;

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
  wandBrushPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wand-brush.json")],
  },
  wandColorPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wand-color.json")],
  },
  wandToolsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wand-tools.json")],
  },
  brushSettings: { required: [BrushSettings] },
  appState: { required: [OpenBrushAppState] },
  selectionState: { required: [SelectionState] },
  settingsState: { required: [SettingsState] },
  persistenceState: { required: [PersistenceState] },
  playbackState: { required: [PlaybackState] },
  uiHistory: { required: [UiCommandHistoryState] },
  strokeHistory: { required: [StrokeHistoryState] },
  eraserCursors: { required: [OpenBrushEraserCursor] },
  layers: { required: [CanvasLayer] },
  strokes: { required: [BrushStroke] },
}) {
  private readonly initializedPanels = new Set<number>();
  private readonly commandHistory = new UiCommandHistory();

  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });
    this.queries.wandBrushPanel.subscribe("qualify", (entity) => {
      this.setupWandBrushPanel(entity);
    });
    this.queries.wandColorPanel.subscribe("qualify", (entity) => {
      this.setupWandColorPanel(entity);
    });
    this.queries.wandToolsPanel.subscribe("qualify", (entity) => {
      this.setupWandToolsPanel(entity);
    });
    for (const entity of this.queries.welcomePanel.entities) {
      this.setupPanel(entity);
    }
    for (const entity of this.queries.wandBrushPanel.entities) {
      this.setupWandBrushPanel(entity);
    }
    for (const entity of this.queries.wandColorPanel.entities) {
      this.setupWandColorPanel(entity);
    }
    for (const entity of this.queries.wandToolsPanel.entities) {
      this.setupWandToolsPanel(entity);
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
      this.updateSettingsLabels(document);
      this.updatePersistenceLabels(document);
      this.updatePlaybackLabels(document);
    }
    for (const entity of this.queries.wandToolsPanel.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.updateWandToolLabels(document);
    }
    for (const entity of this.queries.wandBrushPanel.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.updateBrushLabels(document);
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
    this.nameElement(document, "tool-lazy-input-button");
    this.nameElement(document, "tool-tape-button");
    this.nameElement(document, "tool-stencil-button");
    this.nameElement(document, "tool-color-picker-button");
    this.nameElement(document, "tool-brush-picker-button");
    this.nameElement(document, "tool-dropper-button");
    this.nameElement(document, "tool-pick-button");
    this.nameElement(document, "tool-erase-button");
    this.nameElement(document, "brush-previous-button");
    this.nameElement(document, "brush-next-button");
    this.nameElement(document, "brush-size-down-button");
    this.nameElement(document, "brush-size-up-button");
    this.nameElement(document, "layer-new-button");
    this.nameElement(document, "layer-next-button");
    this.nameElement(document, "layer-toggle-visible-button");
    this.nameElement(document, "layer-toggle-lock-button");
    this.nameElement(document, "layer-move-up-button");
    this.nameElement(document, "layer-move-down-button");
    this.nameElement(document, "layer-clear-button");
    this.nameElement(document, "selection-select-last-button");
    this.nameElement(document, "selection-clear-button");
    this.nameElement(document, "selection-nudge-left-button");
    this.nameElement(document, "selection-nudge-right-button");
    this.nameElement(document, "settings-hand-button");
    this.nameElement(document, "settings-anchor-button");
    this.nameElement(document, "settings-scale-down-button");
    this.nameElement(document, "settings-scale-up-button");
    this.nameElement(document, "settings-distance-near-button");
    this.nameElement(document, "settings-distance-far-button");
    this.nameElement(document, "settings-turn-mode-button");
    this.nameElement(document, "settings-locomotion-button");
    this.nameElement(document, "settings-browser-pointer-button");
    this.nameElement(document, "settings-vignette-button");
    this.nameElement(document, "settings-help-button");
    this.nameElement(document, "sketch-save-button");
    this.nameElement(document, "sketch-save-as-button");
    this.nameElement(document, "sketch-load-button");
    this.nameElement(document, "sketch-export-tilt-button");
    this.nameElement(document, "sketch-export-glb-button");
    this.nameElement(document, "playback-mode-button");
    this.nameElement(document, "playback-rewind-button");
    this.nameElement(document, "playback-step-button");
    this.nameElement(document, "playback-complete-button");

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
      this.toggleStraightEdgeMode();
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

    const lazyInputToolButton = document.getElementById(
      "tool-lazy-input-button",
    ) as TextElement;
    lazyInputToolButton?.addEventListener("click", () => {
      this.selectTool("lazy-input");
    });

    const tapeToolButton = document.getElementById(
      "tool-tape-button",
    ) as TextElement;
    tapeToolButton?.addEventListener("click", () => {
      this.selectTool("tape");
    });

    const stencilToolButton = document.getElementById(
      "tool-stencil-button",
    ) as TextElement;
    stencilToolButton?.addEventListener("click", () => {
      this.selectTool("stencil");
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

    const dropperToolButton = document.getElementById(
      "tool-dropper-button",
    ) as TextElement;
    dropperToolButton?.addEventListener("click", () => {
      this.selectTool("dropper");
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

    const brushSizeDownButton = document.getElementById(
      "brush-size-down-button",
    ) as TextElement;
    brushSizeDownButton?.addEventListener("click", () => {
      this.adjustActiveToolSize(-OPEN_BRUSH_BRUSH_SIZE_BUTTON_STEP);
    });

    const brushSizeUpButton = document.getElementById(
      "brush-size-up-button",
    ) as TextElement;
    brushSizeUpButton?.addEventListener("click", () => {
      this.adjustActiveToolSize(OPEN_BRUSH_BRUSH_SIZE_BUTTON_STEP);
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

    const nudgeLeftButton = document.getElementById(
      "selection-nudge-left-button",
    ) as TextElement;
    nudgeLeftButton?.addEventListener("click", () => {
      this.nudgeSelectedStrokes(-SELECTION_NUDGE_DISTANCE, 0, 0);
    });

    const nudgeRightButton = document.getElementById(
      "selection-nudge-right-button",
    ) as TextElement;
    nudgeRightButton?.addEventListener("click", () => {
      this.nudgeSelectedStrokes(SELECTION_NUDGE_DISTANCE, 0, 0);
    });

    const settingsHandButton = document.getElementById(
      "settings-hand-button",
    ) as TextElement;
    settingsHandButton?.addEventListener("click", () => {
      this.applySettingsCommand({ type: "toggle-dominant-hand" });
    });

    const settingsAnchorButton = document.getElementById(
      "settings-anchor-button",
    ) as TextElement;
    settingsAnchorButton?.addEventListener("click", () => {
      this.applySettingsCommand({
        type: "set-panel-anchor",
        anchor: this.getNextPanelAnchor(),
      });
    });

    const settingsScaleDownButton = document.getElementById(
      "settings-scale-down-button",
    ) as TextElement;
    settingsScaleDownButton?.addEventListener("click", () => {
      this.applySettingsCommand({
        type: "nudge-panel-scale",
        delta: -PANEL_SCALE_STEP,
      });
    });

    const settingsScaleUpButton = document.getElementById(
      "settings-scale-up-button",
    ) as TextElement;
    settingsScaleUpButton?.addEventListener("click", () => {
      this.applySettingsCommand({
        type: "nudge-panel-scale",
        delta: PANEL_SCALE_STEP,
      });
    });

    const settingsDistanceNearButton = document.getElementById(
      "settings-distance-near-button",
    ) as TextElement;
    settingsDistanceNearButton?.addEventListener("click", () => {
      this.applySettingsCommand({
        type: "nudge-panel-distance",
        delta: -PANEL_DISTANCE_STEP,
      });
    });

    const settingsDistanceFarButton = document.getElementById(
      "settings-distance-far-button",
    ) as TextElement;
    settingsDistanceFarButton?.addEventListener("click", () => {
      this.applySettingsCommand({
        type: "nudge-panel-distance",
        delta: PANEL_DISTANCE_STEP,
      });
    });

    const settingsTurnModeButton = document.getElementById(
      "settings-turn-mode-button",
    ) as TextElement;
    settingsTurnModeButton?.addEventListener("click", () => {
      this.applySettingsCommand({ type: "cycle-turn-mode" });
    });

    const settingsLocomotionButton = document.getElementById(
      "settings-locomotion-button",
    ) as TextElement;
    settingsLocomotionButton?.addEventListener("click", () => {
      this.applySettingsCommand({
        type: "set-locomotion-mode",
        mode: this.getNextLocomotionMode(),
      });
    });

    const settingsBrowserPointerButton = document.getElementById(
      "settings-browser-pointer-button",
    ) as TextElement;
    settingsBrowserPointerButton?.addEventListener("click", () => {
      const settings = this.readSettingsState();
      this.applySettingsCommand({
        type: "set-browser-pointer-enabled",
        enabled: !settings.browserPointerEnabled,
      });
    });

    const settingsVignetteButton = document.getElementById(
      "settings-vignette-button",
    ) as TextElement;
    settingsVignetteButton?.addEventListener("click", () => {
      const settings = this.readSettingsState();
      this.applySettingsCommand({
        type: "set-comfort-vignette-enabled",
        enabled: !settings.comfortVignetteEnabled,
      });
    });

    const settingsHelpButton = document.getElementById(
      "settings-help-button",
    ) as TextElement;
    settingsHelpButton?.addEventListener("click", () => {
      this.applySettingsCommand({ type: "toggle-help" });
    });

    const sketchSaveButton = document.getElementById(
      "sketch-save-button",
    ) as TextElement;
    sketchSaveButton?.addEventListener("click", () => {
      this.saveRuntimeSketch(false);
    });

    const sketchSaveAsButton = document.getElementById(
      "sketch-save-as-button",
    ) as TextElement;
    sketchSaveAsButton?.addEventListener("click", () => {
      this.saveRuntimeSketch(true);
    });

    const sketchLoadButton = document.getElementById(
      "sketch-load-button",
    ) as TextElement;
    sketchLoadButton?.addEventListener("click", () => {
      this.loadRuntimeSketch();
    });

    const sketchExportTiltButton = document.getElementById(
      "sketch-export-tilt-button",
    ) as TextElement;
    sketchExportTiltButton?.addEventListener("click", () => {
      this.exportRuntimeSketch("tilt");
    });

    const sketchExportGlbButton = document.getElementById(
      "sketch-export-glb-button",
    ) as TextElement;
    sketchExportGlbButton?.addEventListener("click", () => {
      this.exportRuntimeSketch("glb");
    });

    const playbackModeButton = document.getElementById(
      "playback-mode-button",
    ) as TextElement;
    playbackModeButton?.addEventListener("click", () => {
      this.cyclePlaybackMode();
    });

    const playbackRewindButton = document.getElementById(
      "playback-rewind-button",
    ) as TextElement;
    playbackRewindButton?.addEventListener("click", () => {
      this.rewindPlayback();
    });

    const playbackStepButton = document.getElementById(
      "playback-step-button",
    ) as TextElement;
    playbackStepButton?.addEventListener("click", () => {
      this.stepPlayback();
    });

    const playbackCompleteButton = document.getElementById(
      "playback-complete-button",
    ) as TextElement;
    playbackCompleteButton?.addEventListener("click", () => {
      this.completePlayback();
    });
    this.updateBrushLabels(document);
    this.updateToolLabels(document);
    this.updateLayerLabels(document);
    this.updateSelectionLabels(document);
    this.updateHistoryLabels(document);
    this.updateSettingsLabels(document);
    this.updatePersistenceLabels(document);
    this.updatePlaybackLabels(document);
  }

  private setupWandBrushPanel(entity: Entity): void {
    if (!this.registerPanelDocument(entity)) {
      return;
    }
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    this.nameElement(document, "brush-prev");
    this.nameElement(document, "brush-next");
    this.nameElement(document, "brush-size-down");
    this.nameElement(document, "brush-size-up");
    this.nameElement(document, "wand-brush-name");
    this.nameElement(document, "wand-brush-meta");
    this.nameElement(document, "wand-brush-size");

    const previousBrushButton = document.getElementById(
      "brush-prev",
    ) as TextElement;
    previousBrushButton?.addEventListener("click", () => {
      this.selectBrushOffset(-1);
    });

    const nextBrushButton = document.getElementById("brush-next") as TextElement;
    nextBrushButton?.addEventListener("click", () => {
      this.selectBrushOffset(1);
    });

    const brushSizeDownButton = document.getElementById(
      "brush-size-down",
    ) as TextElement;
    brushSizeDownButton?.addEventListener("click", () => {
      this.adjustActiveToolSize(-OPEN_BRUSH_BRUSH_SIZE_BUTTON_STEP);
    });

    const brushSizeUpButton = document.getElementById(
      "brush-size-up",
    ) as TextElement;
    brushSizeUpButton?.addEventListener("click", () => {
      this.adjustActiveToolSize(OPEN_BRUSH_BRUSH_SIZE_BUTTON_STEP);
    });

    this.updateBrushLabels(document);
  }

  private setupWandColorPanel(entity: Entity): void {
    if (!this.registerPanelDocument(entity)) {
      return;
    }
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    this.nameElement(document, "color-blue");
    this.nameElement(document, "color-red");
    this.nameElement(document, "color-white");

    const blueButton = document.getElementById("color-blue") as TextElement;
    blueButton?.addEventListener("click", () => {
      this.setBrushColor([0.1, 0.45, 0.95, 1]);
    });

    const redButton = document.getElementById("color-red") as TextElement;
    redButton?.addEventListener("click", () => {
      this.setBrushColor([0.95, 0.18, 0.28, 1]);
    });

    const whiteButton = document.getElementById("color-white") as TextElement;
    whiteButton?.addEventListener("click", () => {
      this.setBrushColor([0.98, 0.98, 0.96, 1]);
    });
  }

  private setupWandToolsPanel(entity: Entity): void {
    if (!this.registerPanelDocument(entity)) {
      return;
    }
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    this.nameElement(document, "tool-draw");
    this.nameElement(document, "tool-line");
    this.nameElement(document, "tool-erase");
    this.nameElement(document, "tool-color-picker");
    this.nameElement(document, "tool-brush-picker");
    this.nameElement(document, "tool-dropper");
    this.nameElement(document, "stroke-history-undo");
    this.nameElement(document, "stroke-history-redo");
    this.nameElement(document, "stroke-history-state");

    const drawToolButton = document.getElementById("tool-draw") as TextElement;
    drawToolButton?.addEventListener("click", () => {
      this.selectTool("free-paint");
    });

    const lineToolButton = document.getElementById("tool-line") as TextElement;
    lineToolButton?.addEventListener("click", () => {
      this.toggleStraightEdgeMode();
    });

    const eraseToolButton = document.getElementById("tool-erase") as TextElement;
    eraseToolButton?.addEventListener("click", () => {
      this.selectTool("eraser");
    });

    const colorPickerToolButton = document.getElementById(
      "tool-color-picker",
    ) as TextElement;
    colorPickerToolButton?.addEventListener("click", () => {
      this.selectTool("color-picker");
    });

    const brushPickerToolButton = document.getElementById(
      "tool-brush-picker",
    ) as TextElement;
    brushPickerToolButton?.addEventListener("click", () => {
      this.selectTool("brush-picker");
    });

    const dropperToolButton = document.getElementById(
      "tool-dropper",
    ) as TextElement;
    dropperToolButton?.addEventListener("click", () => {
      this.selectTool("dropper");
    });

    const undoButton = document.getElementById(
      "stroke-history-undo",
    ) as TextElement;
    undoButton?.addEventListener("click", () => {
      this.requestStrokeUndo();
    });

    const redoButton = document.getElementById(
      "stroke-history-redo",
    ) as TextElement;
    redoButton?.addEventListener("click", () => {
      this.requestStrokeRedo();
    });

    this.updateWandToolLabels(document);
  }

  private registerPanelDocument(entity: Entity): boolean {
    if (this.initializedPanels.has(entity.index)) {
      return false;
    }
    const document = PanelDocument.data.document[
      entity.index
    ] as UIKitDocument;
    if (!document) {
      return false;
    }
    this.initializedPanels.add(entity.index);
    return true;
  }

  private selectTool(toolId: OpenBrushToolId): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    if (toolId === "straightedge") {
      this.toggleStraightEdgeMode(appState);
      return;
    }
    const currentTool = resolveOpenBrushTool(
      String(appState.getValue(OpenBrushAppState, "activeTool")),
    );
    const nextTool = resolveOpenBrushTool(toolId);
    const straightEdgeEnabled = Boolean(
      appState.getValue(OpenBrushAppState, "straightEdgeEnabled"),
    );
    if (currentTool.id === nextTool.id && !straightEdgeEnabled) {
      this.setToolStatus(appState, nextTool.status);
      return;
    }

    if (currentTool.id !== nextTool.id) {
      appState.setValue(OpenBrushAppState, "previousTool", currentTool.id);
    }
    appState.setValue(OpenBrushAppState, "activeTool", nextTool.id);
    appState.setValue(OpenBrushAppState, "straightEdgeEnabled", false);
    appState.setValue(OpenBrushAppState, "toolStatus", nextTool.status);
    this.touchToolState(appState);
  }

  private toggleStraightEdgeMode(appState = this.getAppStateEntity()): void {
    if (!appState) {
      return;
    }
    const currentTool = resolveOpenBrushTool(
      String(appState.getValue(OpenBrushAppState, "activeTool")),
    );
    const currentlyEnabled = isStraightEdgeModeActive(
      currentTool.id,
      Boolean(appState.getValue(OpenBrushAppState, "straightEdgeEnabled")),
    );
    const nextEnabled = !currentlyEnabled;
    if (currentTool.id !== "free-paint") {
      appState.setValue(OpenBrushAppState, "previousTool", currentTool.id);
      appState.setValue(OpenBrushAppState, "activeTool", "free-paint");
    }
    appState.setValue(OpenBrushAppState, "straightEdgeEnabled", nextEnabled);
    appState.setValue(
      OpenBrushAppState,
      "toolStatus",
      nextEnabled ? "line-ready" : "draw-ready",
    );
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
    const pickerSpec = resolveOpenBrushPickerToolSpec(activeTool.id);
    if (!pickerSpec) {
      this.setToolStatus(appState, "choose-picker");
      return;
    }

    const target = this.getPickerTargetStroke(this.getActiveLayerIndex(appState));
    if (!target) {
      this.setToolStatus(appState, "nothing-to-pick");
      return;
    }

    const commandIndex = Number(target.getValue(BrushStroke, "commandIndex"));
    if (pickerSpec.picksColor) {
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
    }

    if (pickerSpec.picksBrush) {
      const brushGuid = String(target.getValue(BrushStroke, "brushGuid"));
      settingsEntity.setValue(BrushSettings, "brushGuid", brushGuid);
      if (pickerSpec.picksSize) {
        this.applyPickedBrushSize(
          settingsEntity,
          brushGuid,
          Number(target.getValue(BrushStroke, "brushSize")),
        );
      } else {
        this.syncBrushSettingsSize(settingsEntity, brushGuid);
      }
    }
    this.setToolStatus(
      appState,
      `picked ${pickerSpec.pickedStatusLabel} #${commandIndex}`,
      true,
    );
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
    this.syncBrushSettingsSize(settingsEntity, nextBrush.guid);
  }

  private adjustActiveToolSize(delta01: number): void {
    const appState = this.getAppStateEntity();
    const activeTool = resolveOpenBrushTool(
      appState ? String(appState.getValue(OpenBrushAppState, "activeTool")) : "",
    );
    if (activeTool.erases) {
      const step =
        delta01 < 0
          ? -OPEN_BRUSH_ERASER_SIZE_BUTTON_STEP01
          : OPEN_BRUSH_ERASER_SIZE_BUTTON_STEP01;
      this.adjustEraserSize01(step);
      return;
    }
    this.adjustBrushSize01(delta01);
  }

  private adjustBrushSize01(delta: number): void {
    const settingsEntity = this.getBrushSettingsEntity();
    if (!settingsEntity) {
      return;
    }
    const brushGuid = String(settingsEntity.getValue(BrushSettings, "brushGuid"));
    const brush = findBrushByGuid(openBrushInventory, brushGuid);
    const next = resolveBrushSize01Adjustment(
      Number(settingsEntity.getValue(BrushSettings, "size01")),
      delta,
      brush?.brushSizeRange,
    );
    settingsEntity.setValue(BrushSettings, "size01", next.size01);
    settingsEntity.setValue(BrushSettings, "size", next.size);
    this.touchAppState();
  }

  private adjustEraserSize01(delta01: number): void {
    const cursor = this.getEraserCursorEntity();
    if (!cursor) {
      return;
    }
    const next = resolveOpenBrushEraserSizeAdjustment(
      Number(cursor.getValue(OpenBrushEraserCursor, "radius")),
      delta01,
    );
    cursor.setValue(OpenBrushEraserCursor, "radius", next.radius);
    this.touchAppState();
  }

  private setBrushColor(color: readonly [number, number, number, number]): void {
    const settingsEntity = this.getBrushSettingsEntity();
    if (!settingsEntity) {
      return;
    }
    const colorView = settingsEntity.getVectorView(
      BrushSettings,
      "color",
    ) as Float32Array;
    if (
      colorView[0] === color[0] &&
      colorView[1] === color[1] &&
      colorView[2] === color[2] &&
      colorView[3] === color[3]
    ) {
      return;
    }
    colorView[0] = color[0];
    colorView[1] = color[1];
    colorView[2] = color[2];
    colorView[3] = color[3];
    this.touchAppState();
  }

  private applyPickedBrushSize(
    settingsEntity: Entity,
    brushGuid: string,
    pickedLiveSize: number,
  ): void {
    const brush = findBrushByGuid(openBrushInventory, brushGuid);
    const size01 = liveBrushSizeToSize01(pickedLiveSize, brush?.brushSizeRange);
    settingsEntity.setValue(BrushSettings, "size01", size01);
    settingsEntity.setValue(
      BrushSettings,
      "size",
      brushSize01ToLiveBrushSize(size01, brush?.brushSizeRange),
    );
  }

  private syncBrushSettingsSize(settingsEntity: Entity, brushGuid: string): void {
    const brush = findBrushByGuid(openBrushInventory, brushGuid);
    const size01 = normalizeBrushSize01(
      Number(settingsEntity.getValue(BrushSettings, "size01")),
    );
    settingsEntity.setValue(BrushSettings, "size01", size01);
    settingsEntity.setValue(
      BrushSettings,
      "size",
      brushSize01ToLiveBrushSize(size01, brush?.brushSizeRange),
    );
  }

  private updateBrushLabels(document: UIKitDocument): void {
    const settingsEntity = this.getBrushSettingsEntity();
    const appState = this.getAppStateEntity();
    const activeTool = resolveOpenBrushTool(
      appState ? String(appState.getValue(OpenBrushAppState, "activeTool")) : "",
    );
    const toolStatus = appState
      ? String(appState.getValue(OpenBrushAppState, "toolStatus"))
      : activeTool.status;
    const panelFocusBlocked = isOpenBrushPanelFocusStatus(toolStatus);
    const activeBrushGuid = settingsEntity
      ? String(settingsEntity.getValue(BrushSettings, "brushGuid"))
      : "";
    const activeIndex = resolveSelectableBrushIndex(activeBrushGuid);
    const activeBrush = selectableOpenBrushes[activeIndex];
    const catalogPosition = `${activeIndex + 1}/${selectableOpenBrushes.length}`;
    const size01 = settingsEntity
      ? normalizeBrushSize01(
          Number(settingsEntity.getValue(BrushSettings, "size01")),
        )
      : OPEN_BRUSH_DEFAULT_SIZE01;
    const size = settingsEntity
      ? Number(settingsEntity.getValue(BrushSettings, "size"))
      : brushSize01ToLiveBrushSize(size01, activeBrush?.brushSizeRange);
    const brushSizeReadout = formatOpenBrushSizeMeters(size);
    const brushMeta = activeBrush
      ? [
          activeBrush.geometryFamily,
          activeBrush.materialFamily,
          catalogPosition,
          `size ${Math.round(size01 * 100)}% (${brushSizeReadout})`,
        ].join(" / ")
      : "unavailable";
    const eraserCursor = this.getEraserCursorEntity();
    const eraserRadius = eraserCursor
      ? Number(eraserCursor.getValue(OpenBrushEraserCursor, "radius"))
      : 0;
    const eraserSize01 = openBrushEraserRadiusToSize01(eraserRadius);
    const eraserRadiusReadout = formatOpenBrushSizeMeters(eraserRadius);
    const sizeLabel = activeTool.erases
      ? `Radius ${Math.round(eraserSize01 * 100)}% | ${eraserRadiusReadout}`
      : `Size ${Math.round(size01 * 100)}% | ${brushSizeReadout}`;
    const displayedBrushMeta = activeTool.erases
      ? `${brushMeta} / ${sizeLabel.toLowerCase()}`
      : brushMeta;
    const wandBrushMeta = activeTool.erases
      ? panelFocusBlocked
        ? "panel focus"
        : "contact radius"
      : activeBrush
        ? panelFocusBlocked
          ? `${activeBrush.geometryFamily} / panel focus`
          : `${activeBrush.geometryFamily} / ${catalogPosition}`
        : "unavailable";

    this.setText(document, "active-brush-name", activeBrush?.name ?? "No brush");
    this.setText(document, "active-brush-meta", displayedBrushMeta);
    this.setText(
      document,
      "wand-brush-name",
      activeTool.erases ? "Eraser" : activeBrush?.name ?? "No brush",
    );
    this.setText(
      document,
      "wand-brush-meta",
      wandBrushMeta,
    );
    this.setText(
      document,
      "wand-brush-size",
      sizeLabel,
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
    const selectedTool = resolveOpenBrushTool(
      appState ? String(appState.getValue(OpenBrushAppState, "activeTool")) : "",
    );
    const straightEdgeEnabled = appState
      ? Boolean(appState.getValue(OpenBrushAppState, "straightEdgeEnabled"))
      : false;
    const activeTool = resolveEffectiveOpenBrushTool(
      selectedTool.id,
      straightEdgeEnabled,
    );
    const toolStatus = appState
      ? String(appState.getValue(OpenBrushAppState, "toolStatus"))
      : activeTool.status;

    this.setText(document, "active-tool-name", activeTool.label);
    this.setText(document, "active-tool-state", toolStatus);
    this.setText(
      document,
      "tool-draw-button",
      selectedTool.id === "free-paint" && !straightEdgeEnabled
        ? "Draw *"
        : "Draw",
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
      "tool-lazy-input-button",
      activeTool.id === "lazy-input" ? "Lazy *" : "Lazy",
    );
    this.setText(
      document,
      "tool-tape-button",
      activeTool.id === "tape" ? "Tape *" : "Tape",
    );
    this.setText(
      document,
      "tool-stencil-button",
      activeTool.id === "stencil" ? "Stencil *" : "Stencil",
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
      "tool-dropper-button",
      activeTool.id === "dropper" ? "Dropper *" : "Dropper",
    );
    this.setText(
      document,
      "tool-pick-button",
      activeTool.id === "color-picker"
        ? "Pick Color"
        : activeTool.id === "brush-picker"
          ? "Pick Brush"
          : activeTool.id === "dropper"
            ? "Pick Dropper"
            : "Pick Target",
    );
  }

  private updateWandToolLabels(document: UIKitDocument): void {
    const appState = this.getAppStateEntity();
    const activeTool = resolveOpenBrushTool(
      appState ? String(appState.getValue(OpenBrushAppState, "activeTool")) : "",
    );
    const straightEdgeEnabled = appState
      ? Boolean(appState.getValue(OpenBrushAppState, "straightEdgeEnabled"))
      : false;
    this.setText(
      document,
      "tool-draw",
      activeTool.id === "free-paint" && !straightEdgeEnabled ? "Draw *" : "Draw",
    );
    this.setText(document, "tool-line", straightEdgeEnabled ? "Line *" : "Line");
    this.setText(
      document,
      "tool-erase",
      activeTool.id === "eraser" ? "Erase *" : "Erase",
    );
    this.setText(
      document,
      "tool-color-picker",
      activeTool.id === "color-picker" ? "Color *" : "Color",
    );
    this.setText(
      document,
      "tool-brush-picker",
      activeTool.id === "brush-picker" ? "Brush *" : "Brush",
    );
    this.setText(
      document,
      "tool-dropper",
      activeTool.id === "dropper" ? "Dropper *" : "Dropper",
    );
    const strokeHistory = this.getStrokeHistoryEntity();
    const undoDepth = strokeHistory
      ? Number(strokeHistory.getValue(StrokeHistoryState, "undoDepth"))
      : 0;
    const redoDepth = strokeHistory
      ? Number(strokeHistory.getValue(StrokeHistoryState, "redoDepth"))
      : 0;
    this.setText(
      document,
      "stroke-history-state",
      `${undoDepth} undo | ${redoDepth} redo`,
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

  private nudgeSelectedStrokes(
    deltaX: number,
    deltaY: number,
    deltaZ: number,
  ): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const previousTransforms = this.getSelectedTransformSnapshots();
    if (previousTransforms.length === 0) {
      return;
    }

    const transformStates: RuntimeStrokeTransformState[] = previousTransforms.map(
      (snapshot) => ({
        commandIndex: snapshot.commandIndex,
        selected: true,
        position: snapshot.position,
      }),
    );
    const targetPositions = new Map(
      planSelectedStrokeTranslation(transformStates, [
        deltaX,
        deltaY,
        deltaZ,
      ]).map((target) => [target.commandIndex, target.position] as const),
    );

    this.executeUiCommand({
      name: "nudge-selection",
      redo: () => {
        for (const snapshot of previousTransforms) {
          const targetPosition = targetPositions.get(snapshot.commandIndex);
          if (targetPosition) {
            this.applyStrokeTransform(snapshot.entity, targetPosition);
          }
        }
        this.touchSelectionState();
        this.touchAppState(appState);
      },
      undo: () => {
        for (const snapshot of previousTransforms) {
          this.applyStrokeTransform(snapshot.entity, snapshot.position);
        }
        this.touchSelectionState();
        this.touchAppState(appState);
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

  private updateSettingsLabels(document: UIKitDocument): void {
    const settings = this.readSettingsState();
    this.setText(
      document,
      "settings-summary",
      `${formatTitle(settings.dominantHand)} hand`,
    );
    this.setText(
      document,
      "settings-panel-meta",
      `${formatTitle(settings.turnMode)} turn | ${formatTitle(
        settings.locomotionMode,
      )} | Panel ${settings.panelScale.toFixed(2)}x | ${settings.panelDistance.toFixed(
        2,
      )}m | ${formatAnchor(settings.panelAnchor)}`,
    );
    this.setText(
      document,
      "settings-hand-button",
      `${formatTitle(settings.dominantHand)} Hand`,
    );
    this.setText(
      document,
      "settings-anchor-button",
      formatAnchor(settings.panelAnchor),
    );
    this.setText(
      document,
      "settings-turn-mode-button",
      `${formatTitle(settings.turnMode)} Turn`,
    );
    this.setText(
      document,
      "settings-locomotion-button",
      `${formatTitle(settings.locomotionMode)} Move`,
    );
    this.setText(
      document,
      "settings-browser-pointer-button",
      settings.browserPointerEnabled ? "Pointer On" : "Pointer Off",
    );
    this.setText(
      document,
      "settings-vignette-button",
      settings.comfortVignetteEnabled ? "Vignette On" : "Vignette Off",
    );
    this.setText(
      document,
      "settings-help-button",
      settings.helpVisible ? "Hide Help" : "Show Help",
    );
    this.setText(
      document,
      "settings-status",
      `${settings.settingsStatus} r${settings.settingsRevision}`,
    );
    this.setText(
      document,
      "settings-help-text",
      settings.helpVisible
        ? "Browser pointer and XR rays share the same panel commands."
        : "",
    );
  }

  private updatePersistenceLabels(document: UIKitDocument): void {
    const persistence = this.getPersistenceStateEntity();
    if (!persistence) {
      this.setText(document, "sketch-status", "Persistence unavailable");
      return;
    }
    const status = String(persistence.getValue(PersistenceState, "status"));
    const sketchName = String(
      persistence.getValue(PersistenceState, "activeSketchName"),
    );
    const catalogEntryCount = Number(
      persistence.getValue(PersistenceState, "catalogEntryCount"),
    );
    const lastLayerCount = Number(
      persistence.getValue(PersistenceState, "lastLayerCount"),
    );
    const lastStrokeCount = Number(
      persistence.getValue(PersistenceState, "lastStrokeCount"),
    );
    const lastControlPointCount = Number(
      persistence.getValue(PersistenceState, "lastControlPointCount"),
    );
    const lastByteLength = Number(
      persistence.getValue(PersistenceState, "lastTiltByteLength"),
    );
    const dirty = Boolean(persistence.getValue(PersistenceState, "isDirty"));

    this.setText(document, "sketch-name", sketchName);
    this.setText(
      document,
      "sketch-status",
      `${status}${dirty ? " | dirty" : ""} | ${catalogEntryCount} saved`,
    );
    this.setText(
      document,
      "sketch-meta",
      `${lastLayerCount} layers | ${lastStrokeCount} strokes | ${lastControlPointCount} points | ${formatBytes(
        lastByteLength,
      )}`,
    );
  }

  private updatePlaybackLabels(document: UIKitDocument): void {
    const playback = this.getPlaybackStateEntity();
    if (!playback) {
      this.setText(document, "playback-status", "Playback unavailable");
      return;
    }
    const mode = String(playback.getValue(PlaybackState, "mode"));
    const status = String(playback.getValue(PlaybackState, "status"));
    const cursor = Number(playback.getValue(PlaybackState, "cursor"));
    const duration = Number(playback.getValue(PlaybackState, "duration"));
    const unit = String(playback.getValue(PlaybackState, "unit"));
    const visibleStrokeCount = Number(
      playback.getValue(PlaybackState, "visibleStrokeCount"),
    );
    const totalStrokeCount = Number(
      playback.getValue(PlaybackState, "totalStrokeCount"),
    );

    this.setText(document, "playback-mode", `${formatTitle(mode)} playback`);
    this.setText(
      document,
      "playback-status",
      `${status} | ${visibleStrokeCount}/${totalStrokeCount} visible`,
    );
    this.setText(
      document,
      "playback-meta",
      `${cursor.toFixed(1)}/${duration.toFixed(1)} ${unit}`,
    );
    this.setText(
      document,
      "playback-mode-button",
      `${formatTitle(mode)} Mode`,
    );
  }

  private saveRuntimeSketch(saveAs: boolean): void {
    const persistence = this.getPersistenceStateEntity();
    if (!persistence) {
      return;
    }
    const metrics = this.getRuntimeSketchMetrics();
    const now = Date.now();
    const saveRevision = Number(
      persistence.getValue(PersistenceState, "saveRevision"),
    );
    const catalogEntryCount = Math.max(
      1,
      Number(persistence.getValue(PersistenceState, "catalogEntryCount")) +
        (saveAs ? 1 : 0),
    );
    const sketchId =
      !saveAs && String(persistence.getValue(PersistenceState, "activeSketchId"))
        ? String(persistence.getValue(PersistenceState, "activeSketchId"))
        : `runtime-sketch-${saveRevision + 1}`;
    const sketchName = saveAs
      ? `Runtime Sketch ${saveRevision + 1}`
      : String(persistence.getValue(PersistenceState, "activeSketchName")) ||
        "Untitled Sketch";

    persistence.setValue(PersistenceState, "activeSketchId", sketchId);
    persistence.setValue(PersistenceState, "activeSketchName", sketchName);
    persistence.setValue(PersistenceState, "status", saveAs ? "saved-as" : "saved");
    persistence.setValue(PersistenceState, "error", "");
    persistence.setValue(PersistenceState, "catalogEntryCount", catalogEntryCount);
    persistence.setValue(PersistenceState, "saveRevision", saveRevision + 1);
    persistence.setValue(PersistenceState, "lastSavedAtMs", now);
    persistence.setValue(
      PersistenceState,
      "lastTiltByteLength",
      metrics.tiltByteLength,
    );
    persistence.setValue(PersistenceState, "lastThumbnailByteLength", 67);
    this.writePersistenceMetrics(persistence, metrics);
    persistence.setValue(PersistenceState, "isDirty", false);
  }

  private loadRuntimeSketch(): void {
    const persistence = this.getPersistenceStateEntity();
    if (!persistence) {
      return;
    }
    const metrics = this.getRuntimeSketchMetrics();
    const loadRevision = Number(
      persistence.getValue(PersistenceState, "loadRevision"),
    );
    const activeSketchId = String(
      persistence.getValue(PersistenceState, "activeSketchId"),
    );
    persistence.setValue(
      PersistenceState,
      "activeSketchId",
      activeSketchId || "runtime-sketch-latest",
    );
    persistence.setValue(PersistenceState, "status", "loaded");
    persistence.setValue(PersistenceState, "error", "");
    persistence.setValue(PersistenceState, "loadRevision", loadRevision + 1);
    persistence.setValue(PersistenceState, "lastLoadedAtMs", Date.now());
    persistence.setValue(
      PersistenceState,
      "catalogEntryCount",
      Math.max(1, Number(persistence.getValue(PersistenceState, "catalogEntryCount"))),
    );
    this.writePersistenceMetrics(persistence, metrics);
    persistence.setValue(PersistenceState, "isDirty", false);
  }

  private exportRuntimeSketch(kind: "tilt" | "glb"): void {
    const persistence = this.getPersistenceStateEntity();
    if (!persistence) {
      return;
    }
    const metrics = this.getRuntimeSketchMetrics();
    const exportRevision = Number(
      persistence.getValue(PersistenceState, "exportRevision"),
    );
    persistence.setValue(
      PersistenceState,
      "status",
      kind === "tilt" ? "exported" : "glb-exported",
    );
    persistence.setValue(PersistenceState, "error", "");
    persistence.setValue(PersistenceState, "exportRevision", exportRevision + 1);
    persistence.setValue(PersistenceState, "lastExportedAtMs", Date.now());
    persistence.setValue(
      PersistenceState,
      "lastTiltByteLength",
      kind === "tilt" ? metrics.tiltByteLength : metrics.glbByteLength,
    );
    this.writePersistenceMetrics(persistence, metrics);
  }

  private cyclePlaybackMode(): void {
    const playback = this.getPlaybackStateEntity();
    if (!playback) {
      return;
    }
    const currentMode = String(playback.getValue(PlaybackState, "mode"));
    const currentIndex = PLAYBACK_MODES.indexOf(
      currentMode as (typeof PLAYBACK_MODES)[number],
    );
    const nextMode =
      PLAYBACK_MODES[(currentIndex + 1 + PLAYBACK_MODES.length) % PLAYBACK_MODES.length];
    const metrics = this.getRuntimeSketchMetrics();
    playback.setValue(PlaybackState, "mode", nextMode);
    playback.setValue(PlaybackState, "status", "ready");
    playback.setValue(PlaybackState, "cursor", 0);
    playback.setValue(
      PlaybackState,
      "duration",
      nextMode === "quickload" ? 0 : Math.max(1, metrics.strokeCount),
    );
    playback.setValue(
      PlaybackState,
      "unit",
      nextMode === "timestamp"
        ? "ms"
        : nextMode === "distance"
          ? "meters"
          : "none",
    );
    playback.setValue(PlaybackState, "visibleStrokeCount", 0);
    playback.setValue(PlaybackState, "newlyVisibleStrokeCount", 0);
    playback.setValue(PlaybackState, "hiddenStrokeCount", 0);
    playback.setValue(PlaybackState, "totalStrokeCount", metrics.strokeCount);
    playback.setValue(PlaybackState, "missingBrushCount", 0);
    this.touchPlaybackRevision(playback);
  }

  private rewindPlayback(): void {
    const playback = this.getPlaybackStateEntity();
    if (!playback) {
      return;
    }
    const previousVisible = Number(
      playback.getValue(PlaybackState, "visibleStrokeCount"),
    );
    playback.setValue(PlaybackState, "status", "rewound");
    playback.setValue(PlaybackState, "cursor", 0);
    playback.setValue(PlaybackState, "visibleStrokeCount", 0);
    playback.setValue(PlaybackState, "newlyVisibleStrokeCount", 0);
    playback.setValue(PlaybackState, "hiddenStrokeCount", previousVisible);
    this.touchPlaybackRevision(playback);
  }

  private stepPlayback(): void {
    const playback = this.getPlaybackStateEntity();
    if (!playback) {
      return;
    }
    const mode = String(playback.getValue(PlaybackState, "mode"));
    const total = this.getPlaybackTotal(playback);
    const previousVisible = Number(
      playback.getValue(PlaybackState, "visibleStrokeCount"),
    );
    const nextVisible = mode === "quickload" ? total : Math.min(total, previousVisible + 1);
    const duration = Number(playback.getValue(PlaybackState, "duration"));
    const nextCursor =
      mode === "quickload"
        ? 0
        : Math.min(duration, Number(playback.getValue(PlaybackState, "cursor")) + 1);
    playback.setValue(
      PlaybackState,
      "status",
      nextVisible >= total ? "complete" : "playing",
    );
    playback.setValue(PlaybackState, "cursor", nextCursor);
    playback.setValue(PlaybackState, "visibleStrokeCount", nextVisible);
    playback.setValue(
      PlaybackState,
      "newlyVisibleStrokeCount",
      Math.max(0, nextVisible - previousVisible),
    );
    playback.setValue(PlaybackState, "hiddenStrokeCount", 0);
    this.touchPlaybackRevision(playback);
  }

  private completePlayback(): void {
    const playback = this.getPlaybackStateEntity();
    if (!playback) {
      return;
    }
    const total = this.getPlaybackTotal(playback);
    const previousVisible = Number(
      playback.getValue(PlaybackState, "visibleStrokeCount"),
    );
    playback.setValue(PlaybackState, "status", "complete");
    playback.setValue(
      PlaybackState,
      "cursor",
      Number(playback.getValue(PlaybackState, "duration")),
    );
    playback.setValue(PlaybackState, "visibleStrokeCount", total);
    playback.setValue(
      PlaybackState,
      "newlyVisibleStrokeCount",
      Math.max(0, total - previousVisible),
    );
    playback.setValue(PlaybackState, "hiddenStrokeCount", 0);
    this.touchPlaybackRevision(playback);
  }

  private writePersistenceMetrics(
    persistence: Entity,
    metrics: RuntimeSketchMetrics,
  ): void {
    persistence.setValue(PersistenceState, "lastLayerCount", metrics.layerCount);
    persistence.setValue(PersistenceState, "lastStrokeCount", metrics.strokeCount);
    persistence.setValue(
      PersistenceState,
      "lastControlPointCount",
      metrics.controlPointCount,
    );
  }

  private getRuntimeSketchMetrics(): RuntimeSketchMetrics {
    let layerCount = 0;
    let strokeCount = 0;
    let controlPointCount = 0;
    for (const layer of this.queries.layers.entities) {
      if (!layer.getValue(CanvasLayer, "selectionCanvas")) {
        layerCount += 1;
      }
    }
    for (const stroke of this.queries.strokes.entities) {
      if (stroke.getValue(BrushStroke, "visible")) {
        strokeCount += 1;
        controlPointCount += Number(
          stroke.getValue(BrushStroke, "controlPointCount"),
        );
      }
    }
    return {
      layerCount,
      strokeCount,
      controlPointCount,
      tiltByteLength: 128 + layerCount * 32 + controlPointCount * 36,
      glbByteLength: 512 + strokeCount * 128 + controlPointCount * 48,
    };
  }

  private getPlaybackTotal(playback: Entity): number {
    const total = Number(playback.getValue(PlaybackState, "totalStrokeCount"));
    if (total > 0) {
      return total;
    }
    const metrics = this.getRuntimeSketchMetrics();
    playback.setValue(PlaybackState, "totalStrokeCount", metrics.strokeCount);
    return metrics.strokeCount;
  }

  private touchPlaybackRevision(playback: Entity): void {
    playback.setValue(
      PlaybackState,
      "revision",
      Number(playback.getValue(PlaybackState, "revision")) + 1,
    );
  }

  private applySettingsCommand(command: OpenBrushSettingsCommand): void {
    const settingsEntity = this.getSettingsStateEntity();
    if (!settingsEntity) {
      return;
    }
    const result = resolveOpenBrushSettingsCommand(
      this.readSettingsState(settingsEntity),
      command,
    );
    this.writeSettingsState(settingsEntity, result.settings);
  }

  private readSettingsState(
    entity = this.getSettingsStateEntity(),
  ): OpenBrushSettings {
    if (!entity) {
      return normalizeOpenBrushSettings(undefined);
    }
    return normalizeOpenBrushSettings({
      dominantHand: String(entity.getValue(SettingsState, "dominantHand")),
      panelScale: Number(entity.getValue(SettingsState, "panelScale")),
      panelDistance: Number(entity.getValue(SettingsState, "panelDistance")),
      panelHeight: Number(entity.getValue(SettingsState, "panelHeight")),
      panelAnchor: String(entity.getValue(SettingsState, "panelAnchor")),
      wandPanelRotationSteps: Number(
        entity.getValue(SettingsState, "wandPanelRotationSteps"),
      ),
      turnMode: String(entity.getValue(SettingsState, "turnMode")),
      snapTurnDegrees: Number(entity.getValue(SettingsState, "snapTurnDegrees")),
      continuousTurnDegreesPerSecond: Number(
        entity.getValue(SettingsState, "continuousTurnDegreesPerSecond"),
      ),
      locomotionMode: String(entity.getValue(SettingsState, "locomotionMode")),
      browserPointerEnabled: Boolean(
        entity.getValue(SettingsState, "browserPointerEnabled"),
      ),
      xrRayEnabled: Boolean(entity.getValue(SettingsState, "xrRayEnabled")),
      comfortVignetteEnabled: Boolean(
        entity.getValue(SettingsState, "comfortVignetteEnabled"),
      ),
      helpVisible: Boolean(entity.getValue(SettingsState, "helpVisible")),
      controllerHintsVisible: Boolean(
        entity.getValue(SettingsState, "controllerHintsVisible"),
      ),
      settingsRevision: Number(
        entity.getValue(SettingsState, "settingsRevision"),
      ),
      lastSettingsCommand: String(
        entity.getValue(SettingsState, "lastSettingsCommand"),
      ),
      settingsStatus: String(entity.getValue(SettingsState, "settingsStatus")),
    });
  }

  private writeSettingsState(
    entity: Entity,
    settings: OpenBrushSettings,
  ): void {
    entity.setValue(SettingsState, "dominantHand", settings.dominantHand);
    entity.setValue(SettingsState, "panelScale", settings.panelScale);
    entity.setValue(SettingsState, "panelDistance", settings.panelDistance);
    entity.setValue(SettingsState, "panelHeight", settings.panelHeight);
    entity.setValue(SettingsState, "panelAnchor", settings.panelAnchor);
    entity.setValue(
      SettingsState,
      "wandPanelRotationSteps",
      settings.wandPanelRotationSteps,
    );
    entity.setValue(SettingsState, "turnMode", settings.turnMode);
    entity.setValue(SettingsState, "snapTurnDegrees", settings.snapTurnDegrees);
    entity.setValue(
      SettingsState,
      "continuousTurnDegreesPerSecond",
      settings.continuousTurnDegreesPerSecond,
    );
    entity.setValue(SettingsState, "locomotionMode", settings.locomotionMode);
    entity.setValue(
      SettingsState,
      "browserPointerEnabled",
      settings.browserPointerEnabled,
    );
    entity.setValue(SettingsState, "xrRayEnabled", settings.xrRayEnabled);
    entity.setValue(
      SettingsState,
      "comfortVignetteEnabled",
      settings.comfortVignetteEnabled,
    );
    entity.setValue(SettingsState, "helpVisible", settings.helpVisible);
    entity.setValue(
      SettingsState,
      "controllerHintsVisible",
      settings.controllerHintsVisible,
    );
    entity.setValue(
      SettingsState,
      "settingsRevision",
      settings.settingsRevision,
    );
    entity.setValue(
      SettingsState,
      "lastSettingsCommand",
      settings.lastSettingsCommand,
    );
    entity.setValue(SettingsState, "settingsStatus", settings.settingsStatus);
  }

  private getNextPanelAnchor(): OpenBrushPanelAnchor {
    const settings = this.readSettingsState();
    const currentIndex = PANEL_ANCHORS.indexOf(settings.panelAnchor);
    return PANEL_ANCHORS[(currentIndex + 1) % PANEL_ANCHORS.length];
  }

  private getNextLocomotionMode(): OpenBrushLocomotionMode {
    const settings = this.readSettingsState();
    return settings.locomotionMode === "stationary" ? "smooth" : "stationary";
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

  private getEraserCursorEntity(): Entity | undefined {
    const next = this.queries.eraserCursors.entities.values().next();
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

  private getSettingsStateEntity(): Entity | undefined {
    const next = this.queries.settingsState.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getPersistenceStateEntity(): Entity | undefined {
    const next = this.queries.persistenceState.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getPlaybackStateEntity(): Entity | undefined {
    const next = this.queries.playbackState.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getUiCommandHistoryEntity(): Entity | undefined {
    const next = this.queries.uiHistory.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getStrokeHistoryEntity(): Entity | undefined {
    const next = this.queries.strokeHistory.entities.values().next();
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

  private getSelectedTransformSnapshots(): StrokeTransformSnapshot[] {
    const snapshots: StrokeTransformSnapshot[] = [];
    for (const stroke of this.queries.strokes.entities) {
      if (!stroke.getValue(BrushStroke, "selected") || !stroke.object3D) {
        continue;
      }
      snapshots.push({
        entity: stroke,
        commandIndex: Number(stroke.getValue(BrushStroke, "commandIndex")),
        position: [
          stroke.object3D.position.x,
          stroke.object3D.position.y,
          stroke.object3D.position.z,
        ],
      });
    }
    return snapshots;
  }

  private applyStrokeTransform(
    stroke: Entity,
    position: [number, number, number],
  ): void {
    stroke.object3D?.position.set(position[0], position[1], position[2]);
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

  private requestStrokeUndo(): void {
    this.requestStrokeHistory("strokeUndoRequestRevision");
  }

  private requestStrokeRedo(): void {
    this.requestStrokeHistory("strokeRedoRequestRevision");
  }

  private requestStrokeHistory(
    field: "strokeUndoRequestRevision" | "strokeRedoRequestRevision",
  ): void {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }
    const currentRevision = Number(appState.getValue(OpenBrushAppState, field));
    const nextRevision = Number.isFinite(currentRevision)
      ? Math.trunc(currentRevision) + 1
      : 1;
    appState.setValue(
      OpenBrushAppState,
      field,
      nextRevision,
    );
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

function formatTitle(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAnchor(anchor: OpenBrushPanelAnchor): string {
  switch (anchor) {
    case "off-hand":
      return "Off Hand";
    case "dominant-hand":
      return "Dominant Hand";
    case "center":
      return "Center";
  }
}

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) {
    return `${Math.max(0, Math.round(byteLength))} B`;
  }
  return `${(byteLength / 1024).toFixed(1)} KB`;
}

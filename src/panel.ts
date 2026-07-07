import {
  createSystem,
  Hovered,
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
  brushSize01ToLiveBrushSize,
  normalizeBrushSize01,
  resolveBrushSize01Adjustment,
} from "./openbrush/brush-size.js";
import { findBrushByGuid } from "./openbrush/brush-inventory.js";
import { SketchLibrarySystem } from "./systems/SketchLibrarySystem.js";
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
  resolveOpenBrushPickerToolSpec,
  resolveOpenBrushTool,
  resolveOpenBrushEraserSizeAdjustment,
  type OpenBrushToolId,
} from "./openbrush/tools.js";
import {
  isStraightEdgeModeActive,
  resolveEffectiveOpenBrushTool,
} from "./openbrush/tool-modes.js";
import {
  UiCommandHistory,
  type UiCommand,
} from "./openbrush/ui-command-history.js";
import {
  resolveOpenBrushPickerBrushSettings,
  type OpenBrushBrushSettingsSnapshot,
  type OpenBrushPickedStrokeSnapshot,
} from "./openbrush/picker-settings.js";
import { resolveWandBrushPanelLabels } from "./openbrush/wand-brush-panel-labels.js";
import {
  PHASE_A_WAND_BUTTON_IDS,
  resolvePhaseAWandButtonTone,
  resolvePhaseAWandButtonVisualState,
  type PhaseAWandButtonId,
  type PhaseAWandButtonTone,
  type PhaseAWandButtonVisualState,
} from "./openbrush/wand-panel-styles.js";
import { clearUIKitInteractionStateExcept } from "./openbrush/uikit-interaction.js";
import {
  normalizeOpenBrushSettings,
  resolveOpenBrushSettingsCommand,
  type OpenBrushLocomotionMode,
  type OpenBrushPanelAnchor,
  type OpenBrushSettings,
  type OpenBrushSettingsCommand,
} from "./openbrush/settings.js";

type TextElement = UIKit.Text | null;
type StyleElement =
  | (UIKitInteractionElement & {
      setProperties(properties: Record<string, unknown>): void;
    })
  | null;
type UIKitInteractionElement = {
  hoveredList?: { value: number[] };
  activeList?: { value: number[] };
  children?: readonly unknown[];
};
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
const WAND_BRUSH_BUTTON_IDS = [
  "brush-prev",
  "brush-next",
  "brush-size-down",
  "brush-size-up",
] as const;
// Shared wand-button palette: every button keeps a white outline; state is
// signaled through the fill (selected = bright, hover = subtle, pressed =
// brighter) so the wand panels react consistently, matching the brush page
// cells in ui/wand-brush.uikitml.
const WAND_BUTTON_BACKGROUND = "rgba(0, 0, 0, 0.02)";
const WAND_BUTTON_ACTIVE_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.28)",
  borderColor: 0xffffff,
  color: 0xffffff,
} as const;
const WAND_BUTTON_PRIMARY_STYLE = {
  backgroundColor: WAND_BUTTON_BACKGROUND,
  borderColor: 0xffffff,
  color: 0xffffff,
} as const;
const WAND_BUTTON_SECONDARY_STYLE = {
  backgroundColor: WAND_BUTTON_BACKGROUND,
  borderColor: 0xffffff,
  color: 0xffffff,
} as const;
const WAND_BUTTON_DISABLED_STYLE = {
  backgroundColor: WAND_BUTTON_BACKGROUND,
  borderColor: 0xffffff,
  color: 0x8b95a8,
} as const;
const WAND_BUTTON_HOVER_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.16)",
  borderColor: 0xffffff,
  color: 0xffffff,
} as const;
const WAND_BUTTON_PRESSED_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.32)",
  borderColor: 0xffffff,
  color: 0xffffff,
} as const;
const WAND_BUTTON_ACTIVE_HOVERABLE_STYLE = {
  ...WAND_BUTTON_ACTIVE_STYLE,
  hover: WAND_BUTTON_HOVER_STYLE,
  active: WAND_BUTTON_PRESSED_STYLE,
} as const;
const WAND_BUTTON_ACTIVE_IDLE_STYLE = {
  ...WAND_BUTTON_ACTIVE_STYLE,
  hover: WAND_BUTTON_ACTIVE_STYLE,
  active: WAND_BUTTON_ACTIVE_STYLE,
} as const;
const WAND_BUTTON_PRIMARY_HOVERABLE_STYLE = {
  ...WAND_BUTTON_PRIMARY_STYLE,
  hover: WAND_BUTTON_HOVER_STYLE,
  active: WAND_BUTTON_PRESSED_STYLE,
} as const;
const WAND_BUTTON_PRIMARY_IDLE_STYLE = {
  ...WAND_BUTTON_PRIMARY_STYLE,
  hover: WAND_BUTTON_PRIMARY_STYLE,
  active: WAND_BUTTON_PRIMARY_STYLE,
} as const;
const WAND_BUTTON_SECONDARY_HOVERABLE_STYLE = {
  ...WAND_BUTTON_SECONDARY_STYLE,
  hover: WAND_BUTTON_HOVER_STYLE,
  active: WAND_BUTTON_PRESSED_STYLE,
} as const;
const WAND_BUTTON_SECONDARY_IDLE_STYLE = {
  ...WAND_BUTTON_SECONDARY_STYLE,
  hover: WAND_BUTTON_SECONDARY_STYLE,
  active: WAND_BUTTON_SECONDARY_STYLE,
} as const;
const WAND_BUTTON_DISABLED_HOVERABLE_STYLE = {
  ...WAND_BUTTON_DISABLED_STYLE,
  hover: WAND_BUTTON_HOVER_STYLE,
  active: WAND_BUTTON_PRESSED_STYLE,
} as const;
const WAND_BUTTON_DISABLED_IDLE_STYLE = {
  ...WAND_BUTTON_DISABLED_STYLE,
  hover: WAND_BUTTON_DISABLED_STYLE,
  active: WAND_BUTTON_DISABLED_STYLE,
} as const;
const WAND_BRUSH_BUTTON_STYLE = {
  backgroundColor: WAND_BUTTON_BACKGROUND,
  borderColor: 0xffffff,
  color: 0xffffff,
} as const;

export class PanelSystem extends createSystem({
  wandToolsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wand-tools.json")],
  },
  wandBrushPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wand-brush.json")],
  },
  wandColorFavoritesPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wand-color-favorites.json")],
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
  private readonly clickSweepBound = new Set<number>();
  private readonly wandPanelWasHovered = new Set<number>();
  private readonly commandHistory = new UiCommandHistory();

  init() {
    this.queries.wandToolsPanel.subscribe("qualify", (entity) => {
      this.setupWandToolsPanel(entity);
    });
    for (const entity of this.queries.wandToolsPanel.entities) {
      this.setupWandToolsPanel(entity);
    }
  }

  update() {
    this.updateUiCommandHistoryState();
    // While a trigger is held, a UIKit click is potentially in flight
    // (pointerdown fired, pointerup pending). Sweeping activeList in that
    // window aborts the click — the "have to click twice" bug — so every
    // sweep below defers until both triggers are released.
    const selectHeld = this.anySelectHeld();
    for (const entity of this.queries.wandToolsPanel.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.updateWandToolLabels(document, entity.hasComponent(Hovered));
      this.clearStaleWandHoverState(
        entity,
        document,
        PHASE_A_WAND_BUTTON_IDS,
        selectHeld,
      );
    }
    // UIKit hover/pressed styling (including the horizon-kit button theme's
    // grey fills) keys off per-element hovered/active lists that stick when
    // the ray leaves mid-press. Sweep them: on every click anywhere (across
    // ALL wand documents), the moment a panel regains hover (so leftovers
    // clear before they are seen), and for a few frames after hover ends.
    for (const query of [
      this.queries.wandToolsPanel,
      this.queries.wandBrushPanel,
      this.queries.wandColorFavoritesPanel,
    ]) {
      for (const entity of query.entities) {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (!document) {
          continue;
        }
        this.bindClickSweep(entity, document);
        const hovered = entity.hasComponent(Hovered);
        if (hovered && !this.wandPanelWasHovered.has(entity.index)) {
          if (!selectHeld) {
            this.wandPanelWasHovered.add(entity.index);
            clearUIKitInteractionStateExcept(document);
          }
        } else if (!hovered) {
          this.wandPanelWasHovered.delete(entity.index);
        }
        if (query !== this.queries.wandToolsPanel) {
          this.clearStaleWandHoverState(entity, document, [], selectHeld);
        }
      }
    }
  }

  private anySelectHeld(): boolean {
    return Boolean(
      this.input.xr.gamepads.left?.getSelecting() ||
        this.input.xr.gamepads.right?.getSelecting(),
    );
  }

  /**
   * Clicks bubble to the document root; on each one, drop stale hover and
   * pressed styling on EVERY wand document except the element being clicked
   * (stale state on one panel is often created while interacting with
   * another).
   */
  private bindClickSweep(entity: Entity, document: UIKitDocument): void {
    if (this.clickSweepBound.has(entity.index)) {
      return;
    }
    this.clickSweepBound.add(entity.index);
    const root = document.rootElement as unknown as {
      addEventListener?: (
        type: string,
        listener: (event: { target?: unknown }) => void,
      ) => void;
    };
    root.addEventListener?.("click", (event) => {
      // If the other hand still holds its trigger, its click is in flight —
      // sweeping now would abort it. The deferred sweeps handle cleanup.
      if (this.anySelectHeld()) {
        return;
      }
      this.sweepAllWandDocuments(event?.target);
    });
  }

  private sweepAllWandDocuments(exceptTarget?: unknown): void {
    for (const query of [
      this.queries.wandToolsPanel,
      this.queries.wandBrushPanel,
      this.queries.wandColorFavoritesPanel,
    ]) {
      for (const entity of query.entities) {
        const document = PanelDocument.data.document[
          entity.index
        ] as UIKitDocument;
        if (document) {
          clearUIKitInteractionStateExcept(document, exceptTarget);
        }
      }
    }
  }

  private setupWandToolsPanel(entity: Entity): void {
    if (!this.registerPanelDocument(entity)) {
      return;
    }
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    this.nameElement(document, "tool-draw");
    this.nameElement(document, "tool-line");
    this.nameElement(document, "tool-erase");
    this.nameElement(document, "tool-dropper");
    this.nameElement(document, "tool-camera");
    this.nameElement(document, "tool-save");
    this.nameElement(document, "tool-home");
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

    const dropperToolButton = document.getElementById(
      "tool-dropper",
    ) as TextElement;
    dropperToolButton?.addEventListener("click", () => {
      this.selectTool("dropper");
    });

    const cameraToolButton = document.getElementById(
      "tool-camera",
    ) as TextElement;
    cameraToolButton?.addEventListener("click", () => {
      this.selectTool("camera");
    });

    const saveButton = document.getElementById("tool-save") as TextElement;
    saveButton?.addEventListener("click", () => {
      this.world.getSystem(SketchLibrarySystem)?.saveActiveSketch();
    });

    const homeButton = document.getElementById("tool-home") as TextElement;
    homeButton?.addEventListener("click", () => {
      this.world.getSystem(SketchLibrarySystem)?.quitToIntro();
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

    this.updateWandToolLabels(document, false);
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
    this.writeBrushSettingsSnapshot(
      settingsEntity,
      resolveOpenBrushPickerBrushSettings(
        pickerSpec,
        this.readBrushSettingsSnapshot(settingsEntity),
        this.readPickedStrokeSnapshot(target),
        openBrushInventory,
      ),
    );
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

  private readBrushSettingsSnapshot(
    settingsEntity: Entity,
  ): OpenBrushBrushSettingsSnapshot {
    const color = settingsEntity.getVectorView(
      BrushSettings,
      "color",
    ) as Float32Array;
    return {
      brushGuid: String(settingsEntity.getValue(BrushSettings, "brushGuid")),
      size01: Number(settingsEntity.getValue(BrushSettings, "size01")),
      size: Number(settingsEntity.getValue(BrushSettings, "size")),
      color: [color[0], color[1], color[2], color[3]],
    };
  }

  private readPickedStrokeSnapshot(
    strokeEntity: Entity,
  ): OpenBrushPickedStrokeSnapshot {
    const color = strokeEntity.getVectorView(
      BrushStroke,
      "color",
    ) as Float32Array;
    return {
      brushGuid: String(strokeEntity.getValue(BrushStroke, "brushGuid")),
      brushSize: Number(strokeEntity.getValue(BrushStroke, "brushSize")),
      color: [color[0], color[1], color[2], color[3]],
    };
  }

  private writeBrushSettingsSnapshot(
    settingsEntity: Entity,
    snapshot: OpenBrushBrushSettingsSnapshot,
  ): void {
    settingsEntity.setValue(BrushSettings, "brushGuid", snapshot.brushGuid);
    settingsEntity.setValue(BrushSettings, "size01", snapshot.size01);
    settingsEntity.setValue(
      BrushSettings,
      "size",
      snapshot.size,
    );
    const color = settingsEntity.getVectorView(
      BrushSettings,
      "color",
    ) as Float32Array;
    color[0] = snapshot.color[0];
    color[1] = snapshot.color[1];
    color[2] = snapshot.color[2];
    color[3] = snapshot.color[3];
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

  private updateWandToolLabels(
    document: UIKitDocument,
    panelHovered: boolean,
  ): void {
    const appState = this.getAppStateEntity();
    const activeTool = resolveOpenBrushTool(
      appState ? String(appState.getValue(OpenBrushAppState, "activeTool")) : "",
    );
    const straightEdgeEnabled = appState
      ? Boolean(appState.getValue(OpenBrushAppState, "straightEdgeEnabled"))
      : false;
    const strokeHistory = this.getStrokeHistoryEntity();
    const undoDepth = strokeHistory
      ? Number(strokeHistory.getValue(StrokeHistoryState, "undoDepth"))
      : 0;
    const redoDepth = strokeHistory
      ? Number(strokeHistory.getValue(StrokeHistoryState, "redoDepth"))
      : 0;
    for (const buttonId of PHASE_A_WAND_BUTTON_IDS) {
      this.applyPhaseAWandButtonStyle(
        document,
        buttonId,
        resolvePhaseAWandButtonVisualState(buttonId, {
          activeToolId: activeTool.id,
          straightEdgeEnabled,
          undoDepth,
          redoDepth,
        }),
        panelHovered,
      );
    }
    this.setText(
      document,
      "stroke-history-state",
      `${undoDepth} undo | ${redoDepth} redo`,
    );
  }

  private applyPhaseAWandButtonStyle(
    document: UIKitDocument,
    buttonId: PhaseAWandButtonId,
    visualState: PhaseAWandButtonVisualState,
    panelHovered: boolean,
  ): void {
    const button = document.getElementById(buttonId) as StyleElement;
    if (!button) {
      return;
    }
    button.setProperties(
      getPhaseAWandButtonStyle(
        visualState,
        resolvePhaseAWandButtonTone(buttonId),
        panelHovered,
      ),
    );
  }

  private resetWandBrushButtonStyles(document: UIKitDocument): void {
    for (const buttonId of WAND_BRUSH_BUTTON_IDS) {
      const button = document.getElementById(buttonId) as StyleElement;
      button?.setProperties(WAND_BRUSH_BUTTON_STYLE);
    }
  }

  // Stale hover state only appears from UIKit events that trail the ray
  // leaving the panel, so sweep for a few frames after hover ends instead of
  // walking the whole element tree every non-hovered frame.
  private static readonly STALE_HOVER_SWEEP_FRAMES = 3;
  private readonly staleHoverSweepsLeft = new Map<number, number>();

  private clearStaleWandHoverState(
    panelEntity: Entity,
    document: UIKitDocument,
    elementIds: readonly string[],
    selectHeld = false,
  ): void {
    if (panelEntity.hasComponent(Hovered)) {
      this.staleHoverSweepsLeft.set(
        panelEntity.index,
        PanelSystem.STALE_HOVER_SWEEP_FRAMES,
      );
      return;
    }
    const sweepsLeft = this.staleHoverSweepsLeft.get(panelEntity.index) ?? 0;
    if (sweepsLeft <= 0) {
      return;
    }
    if (selectHeld) {
      // A pressed trigger means a click may be in flight (e.g. the ray
      // jittered off the panel mid-press); sweep after release instead.
      return;
    }
    this.staleHoverSweepsLeft.set(panelEntity.index, sweepsLeft - 1);
    this.clearUIKitInteractionState(document);
    for (const elementId of elementIds) {
      this.clearUIKitInteractionState(document.getElementById(elementId));
    }
  }

  private clearUIKitInteractionState(element: unknown): void {
    if (!element || typeof element !== "object") {
      return;
    }
    const interactionElement = element as UIKitInteractionElement;
    if (
      interactionElement.hoveredList &&
      interactionElement.hoveredList.value.length > 0
    ) {
      interactionElement.hoveredList.value = [];
    }
    if (
      interactionElement.activeList &&
      interactionElement.activeList.value.length > 0
    ) {
      interactionElement.activeList.value = [];
    }
    if (!interactionElement.children) {
      return;
    }
    for (const child of interactionElement.children) {
      this.clearUIKitInteractionState(child);
    }
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

  // Label sync runs every frame; setProperties allocates and triggers UIKit
  // layout work, so skip elements whose text has not changed.
  private readonly lastSetText = new WeakMap<object, string>();

  private setText(document: UIKitDocument, id: string, text: string): void {
    const element = document.getElementById(id) as TextElement;
    if (!element || this.lastSetText.get(element) === text) {
      return;
    }
    this.lastSetText.set(element, text);
    element.setProperties({ text });
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

function getPhaseAWandButtonStyle(
  visualState: PhaseAWandButtonVisualState,
  tone: PhaseAWandButtonTone,
  panelHovered: boolean,
): Record<string, unknown> {
  if (visualState === "active") {
    return panelHovered
      ? WAND_BUTTON_ACTIVE_HOVERABLE_STYLE
      : WAND_BUTTON_ACTIVE_IDLE_STYLE;
  }
  if (visualState === "disabled") {
    return panelHovered
      ? WAND_BUTTON_DISABLED_HOVERABLE_STYLE
      : WAND_BUTTON_DISABLED_IDLE_STYLE;
  }
  if (tone === "primary") {
    return panelHovered
      ? WAND_BUTTON_PRIMARY_HOVERABLE_STYLE
      : WAND_BUTTON_PRIMARY_IDLE_STYLE;
  }
  return panelHovered
    ? WAND_BUTTON_SECONDARY_HOVERABLE_STYLE
    : WAND_BUTTON_SECONDARY_IDLE_STYLE;
}


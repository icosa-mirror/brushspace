import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import { OpenBrushDebug } from "../components/OpenBrushDebug.js";
import {
  BrushCatalogState,
  BrushPointer,
  BrushSettings,
  BrushStroke,
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
  OPEN_BRUSH_PLAN_FILE,
  OPEN_BRUSH_PORT_PHASE,
  OPEN_BRUSH_PORT_STATUS,
} from "../app/port-phase.js";
import { createPhase1RuntimeSummary } from "../openbrush/fixtures.js";

const phase1Summary = createPhase1RuntimeSummary();

export class RuntimeDebugSystem extends createSystem({
  debug: { required: [OpenBrushDebug] },
  appState: { required: [OpenBrushAppState] },
  brushSettings: { required: [BrushSettings] },
  brushCatalog: { required: [BrushCatalogState] },
  inputCommands: { required: [InputCommandState] },
  canvases: { required: [CanvasLayer] },
  pointers: { required: [BrushPointer] },
  strokes: { required: [BrushStroke] },
  selectionState: { required: [SelectionState] },
  selectionWidgets: { required: [SelectionWidget] },
  history: { required: [StrokeHistoryState] },
  uiHistory: { required: [UiCommandHistoryState] },
  settings: { required: [SettingsState] },
  performance: { required: [PerformanceState] },
  persistence: { required: [PersistenceState] },
  playback: { required: [PlaybackState] },
}) {
  init() {
    this.queries.debug.subscribe("qualify", (entity) => {
      this.applyDebugValues(entity);
    });
    for (const entity of this.queries.debug.entities) {
      this.applyDebugValues(entity);
    }

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        for (const entity of this.queries.debug.entities) {
          entity.setValue(
            OpenBrushDebug,
            "visibilityState",
            String(visibilityState),
          );
        }
      }),
    );
  }

  update() {
    for (const entity of this.queries.debug.entities) {
      this.applyDebugValues(entity);
    }
  }

  private applyDebugValues(entity: Entity) {
    entity.setValue(OpenBrushDebug, "phase", OPEN_BRUSH_PORT_PHASE);
    entity.setValue(OpenBrushDebug, "status", OPEN_BRUSH_PORT_STATUS);
    entity.setValue(OpenBrushDebug, "planFile", OPEN_BRUSH_PLAN_FILE);
    entity.setValue(OpenBrushDebug, "appMode", this.getAppString("mode", "ready"));
    entity.setValue(
      OpenBrushDebug,
      "activeTool",
      this.getAppString("activeTool", "free-paint"),
    );
    entity.setValue(
      OpenBrushDebug,
      "previousTool",
      this.getAppString("previousTool", "free-paint"),
    );
    entity.setValue(
      OpenBrushDebug,
      "toolStatus",
      this.getAppString("toolStatus", "draw-ready"),
    );
    entity.setValue(
      OpenBrushDebug,
      "straightEdgeEnabled",
      this.getAppBoolean("straightEdgeEnabled", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "toolRevision",
      this.getAppNumber("toolRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeBrushGuid",
      this.getBrushString("brushGuid", phase1Summary.activeBrushGuid),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeBrushName",
      this.getCatalogString("activeBrushName", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeGeometryFamily",
      this.getCatalogString("activeGeometryFamily", "ribbon"),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeMaterialFamily",
      this.getCatalogString("activeMaterialFamily", "standard"),
    );
    entity.setValue(
      OpenBrushDebug,
      "brushCatalogWarning",
      this.getCatalogString("warning", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeLayerIndex",
      this.getAppNumber("activeLayerIndex", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "commandSource",
      this.getCommandString("source", "idle"),
    );
    entity.setValue(
      OpenBrushDebug,
      "commandRevision",
      this.getCommandNumber("commandRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "paintPressed",
      this.getCommandBoolean("paintPressed", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "paintDown",
      this.getCommandBoolean("paintDown", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "paintUp",
      this.getCommandBoolean("paintUp", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "inputPressure",
      this.getCommandNumber("pressure", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "layerCount",
      phase1Summary.fixture.layerCount,
    );
    entity.setValue(
      OpenBrushDebug,
      "runtimeLayerCount",
      this.countPaintLayers(),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeLayerName",
      this.getActiveLayerString("layerName", "Sketch"),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeLayerOrder",
      this.getActiveLayerNumber("order", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeLayerVisible",
      this.getActiveLayerBoolean("visible", true),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeLayerLocked",
      this.getActiveLayerBoolean("locked", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "strokeCount",
      phase1Summary.fixture.strokeCount,
    );
    entity.setValue(
      OpenBrushDebug,
      "controlPointCount",
      phase1Summary.fixture.controlPointCount,
    );
    entity.setValue(
      OpenBrushDebug,
      "runtimeCanvasCount",
      this.queries.canvases.entities.size,
    );
    entity.setValue(
      OpenBrushDebug,
      "runtimePointerCount",
      this.queries.pointers.entities.size,
    );
    entity.setValue(
      OpenBrushDebug,
      "runtimeStrokeCount",
      this.queries.strokes.entities.size,
    );
    entity.setValue(
      OpenBrushDebug,
      "runtimeVisibleStrokeCount",
      this.countStrokeBoolean("renderVisible"),
    );
    entity.setValue(
      OpenBrushDebug,
      "runtimeFinalizedStrokeCount",
      this.countStrokeBoolean("finalized"),
    );
    entity.setValue(
      OpenBrushDebug,
      "selectedStrokeCount",
      this.getSelectionNumber("selectedStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeSelectionLayerIndex",
      this.getSelectionNumber("activeSelectionLayerIndex", -1),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastSelectedStrokeCommandIndex",
      this.getSelectionNumber("lastSelectedStrokeCommandIndex", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "selectionRevision",
      this.getSelectionNumber("selectionRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "selectionWidgetActive",
      this.getSelectionWidgetBoolean("active", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "selectionWidgetSelectedStrokeCount",
      this.getSelectionWidgetNumber("selectedStrokeCount", 0),
    );
    this.applySelectionWidgetPosition(entity);
    entity.setValue(
      OpenBrushDebug,
      "activeStrokeControlPoints",
      this.getHistoryNumber("activeStrokeControlPoints", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "undoDepth",
      this.getHistoryNumber("undoDepth", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "redoDepth",
      this.getHistoryNumber("redoDepth", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "uiUndoDepth",
      this.getUiHistoryNumber("undoDepth", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "uiRedoDepth",
      this.getUiHistoryNumber("redoDepth", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "uiHistoryRevision",
      this.getUiHistoryNumber("historyRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "uiLastCommandName",
      this.getUiHistoryString("lastCommandName", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "dominantHand",
      this.getSettingsString("dominantHand", "right"),
    );
    entity.setValue(
      OpenBrushDebug,
      "panelScale",
      this.getSettingsNumber("panelScale", 1),
    );
    entity.setValue(
      OpenBrushDebug,
      "panelDistance",
      this.getSettingsNumber("panelDistance", 0.9),
    );
    entity.setValue(
      OpenBrushDebug,
      "panelHeight",
      this.getSettingsNumber("panelHeight", 1.15),
    );
    entity.setValue(
      OpenBrushDebug,
      "panelAnchor",
      this.getSettingsString("panelAnchor", "off-hand"),
    );
    entity.setValue(
      OpenBrushDebug,
      "turnMode",
      this.getSettingsString("turnMode", "snap"),
    );
    entity.setValue(
      OpenBrushDebug,
      "snapTurnDegrees",
      this.getSettingsNumber("snapTurnDegrees", 30),
    );
    entity.setValue(
      OpenBrushDebug,
      "continuousTurnDegreesPerSecond",
      this.getSettingsNumber("continuousTurnDegreesPerSecond", 90),
    );
    entity.setValue(
      OpenBrushDebug,
      "locomotionMode",
      this.getSettingsString("locomotionMode", "stationary"),
    );
    entity.setValue(
      OpenBrushDebug,
      "browserPointerEnabled",
      this.getSettingsBoolean("browserPointerEnabled", true),
    );
    entity.setValue(
      OpenBrushDebug,
      "xrRayEnabled",
      this.getSettingsBoolean("xrRayEnabled", true),
    );
    entity.setValue(
      OpenBrushDebug,
      "comfortVignetteEnabled",
      this.getSettingsBoolean("comfortVignetteEnabled", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "helpVisible",
      this.getSettingsBoolean("helpVisible", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "controllerHintsVisible",
      this.getSettingsBoolean("controllerHintsVisible", true),
    );
    entity.setValue(
      OpenBrushDebug,
      "settingsRevision",
      this.getSettingsNumber("settingsRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastSettingsCommand",
      this.getSettingsString("lastSettingsCommand", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "settingsStatus",
      this.getSettingsString("settingsStatus", "ready"),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfDrawCallCount",
      this.getPerformanceNumber("drawCallCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfBatchCount",
      this.getPerformanceNumber("batchCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfVisibleStrokeCount",
      this.getPerformanceNumber("visibleStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfFinalizedStrokeCount",
      this.getPerformanceNumber("finalizedStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfVertexCount",
      this.getPerformanceNumber("vertexCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfIndexCount",
      this.getPerformanceNumber("indexCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfBufferUploadBytes",
      this.getPerformanceNumber("bufferUploadBytes", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfMemoryEstimateBytes",
      this.getPerformanceNumber("memoryEstimateBytes", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfMaterialVariantCount",
      this.getPerformanceNumber("materialVariantCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfWarning",
      this.getPerformanceString("warning", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "perfRevision",
      this.getPerformanceNumber("performanceRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "persistenceStatus",
      this.getPersistenceString("status", "idle"),
    );
    entity.setValue(
      OpenBrushDebug,
      "persistenceError",
      this.getPersistenceString("error", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeSketchId",
      this.getPersistenceString("activeSketchId", ""),
    );
    entity.setValue(
      OpenBrushDebug,
      "activeSketchName",
      this.getPersistenceString("activeSketchName", "Untitled Sketch"),
    );
    entity.setValue(
      OpenBrushDebug,
      "sketchCatalogEntryCount",
      this.getPersistenceNumber("catalogEntryCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "sketchSaveRevision",
      this.getPersistenceNumber("saveRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "sketchLoadRevision",
      this.getPersistenceNumber("loadRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "sketchExportRevision",
      this.getPersistenceNumber("exportRevision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastSavedAtMs",
      this.getPersistenceNumber("lastSavedAtMs", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastLoadedAtMs",
      this.getPersistenceNumber("lastLoadedAtMs", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastExportedAtMs",
      this.getPersistenceNumber("lastExportedAtMs", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastTiltByteLength",
      this.getPersistenceNumber("lastTiltByteLength", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastThumbnailByteLength",
      this.getPersistenceNumber("lastThumbnailByteLength", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastPersistedLayerCount",
      this.getPersistenceNumber("lastLayerCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastPersistedStrokeCount",
      this.getPersistenceNumber("lastStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "lastPersistedControlPointCount",
      this.getPersistenceNumber("lastControlPointCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "sketchDirty",
      this.getPersistenceBoolean("isDirty", false),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackMode",
      this.getPlaybackString("mode", "quickload"),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackStatus",
      this.getPlaybackString("status", "idle"),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackCursor",
      this.getPlaybackNumber("cursor", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackDuration",
      this.getPlaybackNumber("duration", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackUnit",
      this.getPlaybackString("unit", "none"),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackVisibleStrokeCount",
      this.getPlaybackNumber("visibleStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackNewlyVisibleStrokeCount",
      this.getPlaybackNumber("newlyVisibleStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackHiddenStrokeCount",
      this.getPlaybackNumber("hiddenStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackTotalStrokeCount",
      this.getPlaybackNumber("totalStrokeCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackMissingBrushCount",
      this.getPlaybackNumber("missingBrushCount", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "playbackRevision",
      this.getPlaybackNumber("revision", 0),
    );
    entity.setValue(
      OpenBrushDebug,
      "brushInventoryTotal",
      phase1Summary.inventory.total,
    );
    entity.setValue(
      OpenBrushDebug,
      "brushInventorySupported",
      phase1Summary.inventory.supported,
    );
    entity.setValue(
      OpenBrushDebug,
      "brushInventoryFallback",
      phase1Summary.inventory.fallback,
    );
    entity.setValue(
      OpenBrushDebug,
      "brushInventoryUnsupported",
      phase1Summary.inventory.unsupported,
    );
    entity.setValue(
      OpenBrushDebug,
      "fixtureMemoryBytes",
      phase1Summary.fixtureMemoryBytes,
    );
    entity.setValue(OpenBrushDebug, "catalogStatus", "inventory-loaded");
    entity.setValue(OpenBrushDebug, "parseStatus", phase1Summary.fixtureParseStatus);
    entity.setValue(
      OpenBrushDebug,
      "visibilityState",
      String(this.world.visibilityState.value),
    );
  }

  private getAppString(
    field: "mode" | "activeTool" | "previousTool" | "toolStatus",
    fallback: string,
  ): string {
    const entity = this.getFirstEntity("appState");
    return entity ? String(entity.getValue(OpenBrushAppState, field)) : fallback;
  }

  private getAppNumber(
    field: "activeLayerIndex" | "toolRevision",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("appState");
    return entity ? Number(entity.getValue(OpenBrushAppState, field)) : fallback;
  }

  private getAppBoolean(field: "straightEdgeEnabled", fallback: boolean): boolean {
    const entity = this.getFirstEntity("appState");
    return entity ? Boolean(entity.getValue(OpenBrushAppState, field)) : fallback;
  }

  private getBrushString(field: "brushGuid", fallback: string): string {
    const entity = this.getFirstEntity("brushSettings");
    return entity ? String(entity.getValue(BrushSettings, field)) : fallback;
  }

  private getCatalogString(
    field:
      | "activeBrushName"
      | "activeGeometryFamily"
      | "activeMaterialFamily"
      | "warning",
    fallback: string,
  ): string {
    const entity = this.getFirstEntity("brushCatalog");
    return entity ? String(entity.getValue(BrushCatalogState, field)) : fallback;
  }

  private getCommandString(field: "source", fallback: string): string {
    const entity = this.getFirstEntity("inputCommands");
    return entity ? String(entity.getValue(InputCommandState, field)) : fallback;
  }

  private getCommandBoolean(
    field: "paintPressed" | "paintDown" | "paintUp",
    fallback: boolean,
  ): boolean {
    const entity = this.getFirstEntity("inputCommands");
    return entity ? Boolean(entity.getValue(InputCommandState, field)) : fallback;
  }

  private getCommandNumber(
    field: "commandRevision" | "pressure",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("inputCommands");
    return entity ? Number(entity.getValue(InputCommandState, field)) : fallback;
  }

  private getHistoryNumber(
    field: "activeStrokeControlPoints" | "undoDepth" | "redoDepth",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("history");
    return entity ? Number(entity.getValue(StrokeHistoryState, field)) : fallback;
  }

  private getUiHistoryNumber(
    field: "undoDepth" | "redoDepth" | "historyRevision",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("uiHistory");
    return entity
      ? Number(entity.getValue(UiCommandHistoryState, field))
      : fallback;
  }

  private getUiHistoryString(
    field: "lastCommandName",
    fallback: string,
  ): string {
    const entity = this.getFirstEntity("uiHistory");
    return entity
      ? String(entity.getValue(UiCommandHistoryState, field))
      : fallback;
  }

  private getSettingsString(
    field:
      | "dominantHand"
      | "panelAnchor"
      | "turnMode"
      | "locomotionMode"
      | "lastSettingsCommand"
      | "settingsStatus",
    fallback: string,
  ): string {
    const entity = this.getFirstEntity("settings");
    return entity ? String(entity.getValue(SettingsState, field)) : fallback;
  }

  private getSettingsNumber(
    field:
      | "panelScale"
      | "panelDistance"
      | "panelHeight"
      | "snapTurnDegrees"
      | "continuousTurnDegreesPerSecond"
      | "settingsRevision",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("settings");
    return entity ? Number(entity.getValue(SettingsState, field)) : fallback;
  }

  private getSettingsBoolean(
    field:
      | "browserPointerEnabled"
      | "xrRayEnabled"
      | "comfortVignetteEnabled"
      | "helpVisible"
      | "controllerHintsVisible",
    fallback: boolean,
  ): boolean {
    const entity = this.getFirstEntity("settings");
    return entity ? Boolean(entity.getValue(SettingsState, field)) : fallback;
  }

  private getPerformanceNumber(
    field:
      | "drawCallCount"
      | "batchCount"
      | "visibleStrokeCount"
      | "finalizedStrokeCount"
      | "vertexCount"
      | "indexCount"
      | "bufferUploadBytes"
      | "memoryEstimateBytes"
      | "materialVariantCount"
      | "performanceRevision",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("performance");
    return entity ? Number(entity.getValue(PerformanceState, field)) : fallback;
  }

  private getPerformanceString(field: "warning", fallback: string): string {
    const entity = this.getFirstEntity("performance");
    return entity ? String(entity.getValue(PerformanceState, field)) : fallback;
  }

  private getPersistenceString(
    field: "activeSketchId" | "activeSketchName" | "status" | "error",
    fallback: string,
  ): string {
    const entity = this.getFirstEntity("persistence");
    return entity ? String(entity.getValue(PersistenceState, field)) : fallback;
  }

  private getPersistenceNumber(
    field:
      | "catalogEntryCount"
      | "saveRevision"
      | "loadRevision"
      | "exportRevision"
      | "lastSavedAtMs"
      | "lastLoadedAtMs"
      | "lastExportedAtMs"
      | "lastTiltByteLength"
      | "lastThumbnailByteLength"
      | "lastLayerCount"
      | "lastStrokeCount"
      | "lastControlPointCount",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("persistence");
    return entity ? Number(entity.getValue(PersistenceState, field)) : fallback;
  }

  private getPersistenceBoolean(field: "isDirty", fallback: boolean): boolean {
    const entity = this.getFirstEntity("persistence");
    return entity ? Boolean(entity.getValue(PersistenceState, field)) : fallback;
  }

  private getPlaybackString(
    field: "mode" | "status" | "unit",
    fallback: string,
  ): string {
    const entity = this.getFirstEntity("playback");
    return entity ? String(entity.getValue(PlaybackState, field)) : fallback;
  }

  private getPlaybackNumber(
    field:
      | "cursor"
      | "duration"
      | "visibleStrokeCount"
      | "newlyVisibleStrokeCount"
      | "hiddenStrokeCount"
      | "totalStrokeCount"
      | "missingBrushCount"
      | "revision",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("playback");
    return entity ? Number(entity.getValue(PlaybackState, field)) : fallback;
  }

  private getSelectionNumber(
    field:
      | "selectedStrokeCount"
      | "activeSelectionLayerIndex"
      | "lastSelectedStrokeCommandIndex"
      | "selectionRevision",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("selectionState");
    return entity ? Number(entity.getValue(SelectionState, field)) : fallback;
  }

  private getSelectionWidgetBoolean(
    field: "active",
    fallback: boolean,
  ): boolean {
    const entity = this.getFirstEntity("selectionWidgets");
    return entity ? Boolean(entity.getValue(SelectionWidget, field)) : fallback;
  }

  private getSelectionWidgetNumber(
    field: "selectedStrokeCount",
    fallback: number,
  ): number {
    const entity = this.getFirstEntity("selectionWidgets");
    return entity ? Number(entity.getValue(SelectionWidget, field)) : fallback;
  }

  private applySelectionWidgetPosition(entity: Entity): void {
    const position = entity.getVectorView(
      OpenBrushDebug,
      "selectionWidgetPosition",
    ) as Float32Array;
    const widget = this.getFirstEntity("selectionWidgets");
    if (!widget?.object3D) {
      position[0] = 0;
      position[1] = 0;
      position[2] = 0;
      return;
    }
    position[0] = widget.object3D.position.x;
    position[1] = widget.object3D.position.y;
    position[2] = widget.object3D.position.z;
  }

  private countStrokeBoolean(
    field: "visible" | "renderVisible" | "finalized",
  ): number {
    let count = 0;
    for (const entity of this.queries.strokes.entities) {
      if (entity.getValue(BrushStroke, field)) {
        count += 1;
      }
    }
    return count;
  }

  private countPaintLayers(): number {
    let count = 0;
    for (const entity of this.queries.canvases.entities) {
      if (!entity.getValue(CanvasLayer, "selectionCanvas")) {
        count += 1;
      }
    }
    return count;
  }

  private getActiveLayerString(field: "layerName", fallback: string): string {
    const layer = this.getActiveLayerEntity();
    return layer ? String(layer.getValue(CanvasLayer, field)) : fallback;
  }

  private getActiveLayerNumber(field: "order", fallback: number): number {
    const layer = this.getActiveLayerEntity();
    return layer ? Number(layer.getValue(CanvasLayer, field)) : fallback;
  }

  private getActiveLayerBoolean(
    field: "visible" | "locked",
    fallback: boolean,
  ): boolean {
    const layer = this.getActiveLayerEntity();
    return layer ? Boolean(layer.getValue(CanvasLayer, field)) : fallback;
  }

  private getActiveLayerEntity(): Entity | undefined {
    const activeLayerIndex = this.getAppNumber("activeLayerIndex", 0);
    for (const entity of this.queries.canvases.entities) {
      if (
        !entity.getValue(CanvasLayer, "selectionCanvas") &&
        Number(entity.getValue(CanvasLayer, "layerIndex")) === activeLayerIndex
      ) {
        return entity;
      }
    }
    return undefined;
  }

  private getFirstEntity(
    queryName:
      | "appState"
      | "brushSettings"
      | "brushCatalog"
      | "inputCommands"
      | "selectionState"
      | "selectionWidgets"
      | "history"
      | "uiHistory"
      | "settings"
      | "performance"
      | "persistence"
      | "playback",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

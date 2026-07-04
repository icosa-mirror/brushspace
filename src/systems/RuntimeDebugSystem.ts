import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import { OpenBrushDebug } from "../components/OpenBrushDebug.js";
import {
  BrushPointer,
  BrushSettings,
  CanvasLayer,
  InputCommandState,
  OpenBrushAppState,
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
  inputCommands: { required: [InputCommandState] },
  canvases: { required: [CanvasLayer] },
  pointers: { required: [BrushPointer] },
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
      "activeBrushGuid",
      this.getBrushString("brushGuid", phase1Summary.activeBrushGuid),
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

  private getAppString(field: "mode" | "activeTool", fallback: string): string {
    const entity = this.getFirstEntity("appState");
    return entity ? String(entity.getValue(OpenBrushAppState, field)) : fallback;
  }

  private getAppNumber(field: "activeLayerIndex", fallback: number): number {
    const entity = this.getFirstEntity("appState");
    return entity ? Number(entity.getValue(OpenBrushAppState, field)) : fallback;
  }

  private getBrushString(field: "brushGuid", fallback: string): string {
    const entity = this.getFirstEntity("brushSettings");
    return entity ? String(entity.getValue(BrushSettings, field)) : fallback;
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

  private getFirstEntity(
    queryName: "appState" | "brushSettings" | "inputCommands",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

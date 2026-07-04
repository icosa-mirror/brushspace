import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import { OpenBrushDebug } from "../components/OpenBrushDebug.js";
import {
  OPEN_BRUSH_PLAN_FILE,
  OPEN_BRUSH_PORT_PHASE,
  OPEN_BRUSH_PORT_STATUS,
} from "../app/port-phase.js";
import { createPhase1RuntimeSummary } from "../openbrush/fixtures.js";

const phase1Summary = createPhase1RuntimeSummary();

export class RuntimeDebugSystem extends createSystem({
  debug: { required: [OpenBrushDebug] },
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

  private applyDebugValues(entity: Entity) {
    entity.setValue(OpenBrushDebug, "phase", OPEN_BRUSH_PORT_PHASE);
    entity.setValue(OpenBrushDebug, "status", OPEN_BRUSH_PORT_STATUS);
    entity.setValue(OpenBrushDebug, "planFile", OPEN_BRUSH_PLAN_FILE);
    entity.setValue(
      OpenBrushDebug,
      "activeBrushGuid",
      phase1Summary.activeBrushGuid,
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
}

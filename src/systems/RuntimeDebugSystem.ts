import { createSystem } from "@iwsdk/core";

import { OpenBrushDebug } from "../components/OpenBrushDebug.js";
import {
  OPEN_BRUSH_PLAN_FILE,
  OPEN_BRUSH_PORT_PHASE,
  OPEN_BRUSH_PORT_STATUS,
} from "../app/port-phase.js";

export class RuntimeDebugSystem extends createSystem({
  debug: { required: [OpenBrushDebug] },
}) {
  init() {
    this.queries.debug.subscribe("qualify", (entity) => {
      entity.setValue(OpenBrushDebug, "phase", OPEN_BRUSH_PORT_PHASE);
      entity.setValue(OpenBrushDebug, "status", OPEN_BRUSH_PORT_STATUS);
      entity.setValue(OpenBrushDebug, "planFile", OPEN_BRUSH_PLAN_FILE);
      entity.setValue(
        OpenBrushDebug,
        "visibilityState",
        String(this.world.visibilityState.value),
      );
    });

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
}

import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushStroke,
  CanvasLayer,
  PerformanceState,
} from "../components/OpenBrushCore.js";
import {
  estimateOpenBrushPerformanceCounters,
  type OpenBrushPerformanceCounters,
} from "../openbrush/performance-counters.js";

export class PerformanceCounterSystem extends createSystem({
  performance: { required: [PerformanceState] },
  layers: { required: [CanvasLayer] },
  strokes: { required: [BrushStroke] },
}) {
  update(): void {
    const performance = this.getPerformanceEntity();
    if (!performance) {
      return;
    }
    const counters = this.createCounters();
    if (!this.hasChanged(performance, counters)) {
      return;
    }
    this.writeCounters(performance, counters);
  }

  private createCounters(): OpenBrushPerformanceCounters {
    let layerCount = 0;
    let visibleStrokeCount = 0;
    let finalizedStrokeCount = 0;
    let vertexCount = 0;
    let indexCount = 0;
    let materialVariantCount = 0;
    let hasStandard = false;
    let hasUnlit = false;
    let hasAdditive = false;
    let hasParticle = false;
    let hasFallback = false;

    for (const layer of this.queries.layers.entities) {
      if (!layer.getValue(CanvasLayer, "selectionCanvas")) {
        layerCount += 1;
      }
    }

    for (const stroke of this.queries.strokes.entities) {
      if (!stroke.getValue(BrushStroke, "visible")) {
        continue;
      }
      visibleStrokeCount += 1;
      if (stroke.getValue(BrushStroke, "finalized")) {
        finalizedStrokeCount += 1;
      }
      vertexCount += Number(stroke.getValue(BrushStroke, "vertexCount"));
      indexCount += Number(stroke.getValue(BrushStroke, "indexCount"));
      switch (String(stroke.getValue(BrushStroke, "materialFamily"))) {
        case "standard":
          hasStandard = true;
          break;
        case "unlit":
          hasUnlit = true;
          break;
        case "additive":
          hasAdditive = true;
          break;
        case "particle":
          hasParticle = true;
          break;
        default:
          hasFallback = true;
          break;
      }
    }

    materialVariantCount += hasStandard ? 1 : 0;
    materialVariantCount += hasUnlit ? 1 : 0;
    materialVariantCount += hasAdditive ? 1 : 0;
    materialVariantCount += hasParticle ? 1 : 0;
    materialVariantCount += hasFallback ? 1 : 0;

    return estimateOpenBrushPerformanceCounters({
      layerCount,
      visibleStrokeCount,
      finalizedStrokeCount,
      vertexCount,
      indexCount,
      materialVariantCount,
    });
  }

  private hasChanged(
    entity: Entity,
    counters: OpenBrushPerformanceCounters,
  ): boolean {
    return (
      Number(entity.getValue(PerformanceState, "drawCallCount")) !==
        counters.drawCallCount ||
      Number(entity.getValue(PerformanceState, "batchCount")) !==
        counters.batchCount ||
      Number(entity.getValue(PerformanceState, "visibleStrokeCount")) !==
        counters.visibleStrokeCount ||
      Number(entity.getValue(PerformanceState, "finalizedStrokeCount")) !==
        counters.finalizedStrokeCount ||
      Number(entity.getValue(PerformanceState, "vertexCount")) !==
        counters.vertexCount ||
      Number(entity.getValue(PerformanceState, "indexCount")) !==
        counters.indexCount ||
      Number(entity.getValue(PerformanceState, "bufferUploadBytes")) !==
        counters.bufferUploadBytes ||
      Number(entity.getValue(PerformanceState, "memoryEstimateBytes")) !==
        counters.memoryEstimateBytes ||
      Number(entity.getValue(PerformanceState, "materialVariantCount")) !==
        counters.materialVariantCount ||
      String(entity.getValue(PerformanceState, "warning")) !== counters.warning
    );
  }

  private writeCounters(
    entity: Entity,
    counters: OpenBrushPerformanceCounters,
  ): void {
    entity.setValue(PerformanceState, "drawCallCount", counters.drawCallCount);
    entity.setValue(PerformanceState, "batchCount", counters.batchCount);
    entity.setValue(
      PerformanceState,
      "visibleStrokeCount",
      counters.visibleStrokeCount,
    );
    entity.setValue(
      PerformanceState,
      "finalizedStrokeCount",
      counters.finalizedStrokeCount,
    );
    entity.setValue(PerformanceState, "vertexCount", counters.vertexCount);
    entity.setValue(PerformanceState, "indexCount", counters.indexCount);
    entity.setValue(
      PerformanceState,
      "bufferUploadBytes",
      counters.bufferUploadBytes,
    );
    entity.setValue(
      PerformanceState,
      "memoryEstimateBytes",
      counters.memoryEstimateBytes,
    );
    entity.setValue(
      PerformanceState,
      "materialVariantCount",
      counters.materialVariantCount,
    );
    entity.setValue(PerformanceState, "warning", counters.warning);
    entity.setValue(
      PerformanceState,
      "performanceRevision",
      Number(entity.getValue(PerformanceState, "performanceRevision")) + 1,
    );
  }

  private getPerformanceEntity(): Entity | undefined {
    const next = this.queries.performance.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

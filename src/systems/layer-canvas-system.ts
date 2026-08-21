import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BatchedBrushStroke,
  BrushStroke,
  CanvasLayer,
  OpenBrushAppState,
} from "../components/core.js";
import { resolveStrokeRenderVisibilityChange } from "../brushes/stroke-batch-feature.js";
import { StrokeBatchRenderSystem } from "./stroke-batch-render-system.js";

export class LayerCanvasSystem extends createSystem({
  appState: { required: [OpenBrushAppState] },
  layers: { required: [CanvasLayer] },
  strokes: { required: [BrushStroke] },
}) {
  update() {
    const appState = this.getAppStateEntity();
    if (!appState) {
      return;
    }

    const activeLayerIndex = this.resolveActiveLayerIndex(
      Number(appState.getValue(OpenBrushAppState, "activeLayerIndex")),
    );
    if (
      activeLayerIndex !==
      Number(appState.getValue(OpenBrushAppState, "activeLayerIndex"))
    ) {
      appState.setValue(OpenBrushAppState, "activeLayerIndex", activeLayerIndex);
    }

    for (const layer of this.queries.layers.entities) {
      const isActive =
        !layer.getValue(CanvasLayer, "selectionCanvas") &&
        Number(layer.getValue(CanvasLayer, "layerIndex")) === activeLayerIndex;
      layer.setValue(CanvasLayer, "active", isActive);
    }

    const batchRenderer = this.world.getSystem(StrokeBatchRenderSystem);
    let hasDeferredBatchVisibility = false;
    for (const stroke of this.queries.strokes.entities) {
      const layer = this.getLayerEntity(
        Number(stroke.getValue(BrushStroke, "layerIndex")),
      );
      const layerVisible = layer
        ? Boolean(layer.getValue(CanvasLayer, "visible"))
        : true;
      const strokeVisible = Boolean(stroke.getValue(BrushStroke, "visible"));
      const visibility = resolveStrokeRenderVisibilityChange(
        Boolean(stroke.getValue(BrushStroke, "renderVisible")),
        strokeVisible,
        layerVisible,
      );
      if (!visibility.changed) {
        continue;
      }
      stroke.setValue(BrushStroke, "renderVisible", visibility.renderVisible);
      if (stroke.hasComponent(BatchedBrushStroke)) {
        const handled = batchRenderer?.setStrokeVisibleDeferred(
          String(stroke.getValue(BrushStroke, "guid")),
          visibility.renderVisible,
        );
        hasDeferredBatchVisibility = Boolean(handled) || hasDeferredBatchVisibility;
        if (!handled && stroke.object3D) {
          stroke.object3D.visible = visibility.renderVisible;
        }
      } else if (stroke.object3D) {
        stroke.object3D.visible = visibility.renderVisible;
      }
    }
    if (hasDeferredBatchVisibility) {
      batchRenderer?.flushDeferredVisibility();
    }
  }

  private resolveActiveLayerIndex(requestedLayerIndex: number): number {
    let firstPaintLayerIndex: number | undefined;
    let firstPaintLayerOrder = Number.MAX_SAFE_INTEGER;
    for (const layer of this.queries.layers.entities) {
      if (layer.getValue(CanvasLayer, "selectionCanvas")) {
        continue;
      }
      const layerIndex = Number(layer.getValue(CanvasLayer, "layerIndex"));
      const layerOrder = Number(layer.getValue(CanvasLayer, "order"));
      if (layerOrder < firstPaintLayerOrder) {
        firstPaintLayerIndex = layerIndex;
        firstPaintLayerOrder = layerOrder;
      }
      if (layerIndex === requestedLayerIndex) {
        return requestedLayerIndex;
      }
    }
    return firstPaintLayerIndex ?? requestedLayerIndex;
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

  private getAppStateEntity(): Entity | undefined {
    const next = this.queries.appState.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

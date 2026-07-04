import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushStroke,
  SelectionState,
} from "../components/OpenBrushCore.js";

export class SelectionSystem extends createSystem({
  selectionState: { required: [SelectionState] },
  strokes: { required: [BrushStroke] },
}) {
  update() {
    const selectionState = this.getSelectionStateEntity();
    if (!selectionState) {
      return;
    }

    const summary = this.summarizeSelection();
    this.setNumberIfChanged(
      selectionState,
      "selectedStrokeCount",
      summary.selectedStrokeCount,
    );
    this.setNumberIfChanged(
      selectionState,
      "activeSelectionLayerIndex",
      summary.activeSelectionLayerIndex,
    );
    this.setNumberIfChanged(
      selectionState,
      "lastSelectedStrokeCommandIndex",
      summary.lastSelectedStrokeCommandIndex,
    );
  }

  private summarizeSelection(): {
    selectedStrokeCount: number;
    activeSelectionLayerIndex: number;
    lastSelectedStrokeCommandIndex: number;
  } {
    let selectedStrokeCount = 0;
    let activeSelectionLayerIndex = -1;
    let lastSelectedStrokeCommandIndex = 0;
    let hasMixedLayerSelection = false;

    for (const stroke of this.queries.strokes.entities) {
      if (!stroke.getValue(BrushStroke, "selected")) {
        continue;
      }
      selectedStrokeCount += 1;
      const layerIndex = Number(stroke.getValue(BrushStroke, "layerIndex"));
      const commandIndex = Number(stroke.getValue(BrushStroke, "commandIndex"));
      lastSelectedStrokeCommandIndex = Math.max(
        lastSelectedStrokeCommandIndex,
        commandIndex,
      );
      if (selectedStrokeCount === 1) {
        activeSelectionLayerIndex = layerIndex;
      } else if (activeSelectionLayerIndex !== layerIndex) {
        hasMixedLayerSelection = true;
        activeSelectionLayerIndex = -1;
      }
    }

    return {
      selectedStrokeCount,
      activeSelectionLayerIndex: hasMixedLayerSelection
        ? -1
        : activeSelectionLayerIndex,
      lastSelectedStrokeCommandIndex,
    };
  }

  private setNumberIfChanged(
    entity: Entity,
    field:
      | "selectedStrokeCount"
      | "activeSelectionLayerIndex"
      | "lastSelectedStrokeCommandIndex",
    value: number,
  ): void {
    if (Number(entity.getValue(SelectionState, field)) !== value) {
      entity.setValue(SelectionState, field, value);
    }
  }

  private getSelectionStateEntity(): Entity | undefined {
    const next = this.queries.selectionState.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

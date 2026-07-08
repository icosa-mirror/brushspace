import { createSystem, Vector3 } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushStroke,
  SelectionState,
  SelectionWidget,
} from "../components/core.js";

export class SelectionSystem extends createSystem({
  selectionState: { required: [SelectionState] },
  strokes: { required: [BrushStroke] },
  widgets: { required: [SelectionWidget] },
}) {
  private widgetPosition!: Vector3;
  private selectionCenter!: Vector3;
  private movementDelta!: Vector3;
  private lastSelectionRevision = -1;

  init() {
    this.widgetPosition = new Vector3();
    this.selectionCenter = new Vector3();
    this.movementDelta = new Vector3();
  }

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
    this.updateSelectionWidget(selectionState, summary.selectedStrokeCount);
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

  private updateSelectionWidget(
    selectionState: Entity,
    selectedStrokeCount: number,
  ): void {
    const widget = this.getSelectionWidgetEntity();
    if (!widget || !widget.object3D) {
      return;
    }

    if (selectedStrokeCount === 0) {
      this.setWidgetActive(widget, false);
      this.setWidgetInitialized(widget, false);
      this.setWidgetSelectedStrokeCount(widget, 0);
      widget.object3D.visible = false;
      this.lastSelectionRevision = Number(
        selectionState.getValue(SelectionState, "selectionRevision"),
      );
      return;
    }

    const selectionRevision = Number(
      selectionState.getValue(SelectionState, "selectionRevision"),
    );
    const initialized = Boolean(
      widget.getValue(SelectionWidget, "initialized"),
    );

    if (!initialized || selectionRevision !== this.lastSelectionRevision) {
      if (this.computeSelectedStrokeCenter(this.selectionCenter)) {
        widget.object3D.position.copy(this.selectionCenter);
        this.writeWidgetLastPosition(widget, this.selectionCenter);
      }
      this.setWidgetInitialized(widget, true);
      this.setWidgetActive(widget, true);
      this.setWidgetSelectedStrokeCount(widget, selectedStrokeCount);
      widget.object3D.visible = true;
      this.lastSelectionRevision = selectionRevision;
      return;
    }

    const lastPosition = widget.getVectorView(
      SelectionWidget,
      "lastPosition",
    ) as Float32Array;
    this.widgetPosition.copy(widget.object3D.position);
    this.movementDelta.set(
      this.widgetPosition.x - lastPosition[0],
      this.widgetPosition.y - lastPosition[1],
      this.widgetPosition.z - lastPosition[2],
    );

    if (this.movementDelta.lengthSq() > 0.0000001) {
      this.applyDeltaToSelectedStrokes(this.movementDelta);
      this.writeWidgetLastPosition(widget, this.widgetPosition);
    }
    this.setWidgetActive(widget, true);
    this.setWidgetSelectedStrokeCount(widget, selectedStrokeCount);
    widget.object3D.visible = true;
  }

  private computeSelectedStrokeCenter(out: Vector3): boolean {
    let selectedCount = 0;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const stroke of this.queries.strokes.entities) {
      if (!stroke.getValue(BrushStroke, "selected")) {
        continue;
      }
      selectedCount += 1;
      const minBounds = stroke.getVectorView(
        BrushStroke,
        "minBounds",
      ) as Float32Array;
      const maxBounds = stroke.getVectorView(
        BrushStroke,
        "maxBounds",
      ) as Float32Array;
      const objectPosition = stroke.object3D?.position;
      const offsetX = objectPosition?.x ?? 0;
      const offsetY = objectPosition?.y ?? 0;
      const offsetZ = objectPosition?.z ?? 0;

      minX = Math.min(minX, minBounds[0] + offsetX);
      minY = Math.min(minY, minBounds[1] + offsetY);
      minZ = Math.min(minZ, minBounds[2] + offsetZ);
      maxX = Math.max(maxX, maxBounds[0] + offsetX);
      maxY = Math.max(maxY, maxBounds[1] + offsetY);
      maxZ = Math.max(maxZ, maxBounds[2] + offsetZ);
    }

    if (selectedCount === 0) {
      return false;
    }

    out.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
    return true;
  }

  private applyDeltaToSelectedStrokes(delta: Vector3): void {
    for (const stroke of this.queries.strokes.entities) {
      if (!stroke.getValue(BrushStroke, "selected") || !stroke.object3D) {
        continue;
      }
      stroke.object3D.position.add(delta);
    }
  }

  private writeWidgetLastPosition(widget: Entity, position: Vector3): void {
    const lastPosition = widget.getVectorView(
      SelectionWidget,
      "lastPosition",
    ) as Float32Array;
    lastPosition[0] = position.x;
    lastPosition[1] = position.y;
    lastPosition[2] = position.z;
  }

  private setWidgetActive(widget: Entity, active: boolean): void {
    if (Boolean(widget.getValue(SelectionWidget, "active")) !== active) {
      widget.setValue(SelectionWidget, "active", active);
    }
  }

  private setWidgetInitialized(widget: Entity, initialized: boolean): void {
    if (
      Boolean(widget.getValue(SelectionWidget, "initialized")) !== initialized
    ) {
      widget.setValue(SelectionWidget, "initialized", initialized);
    }
  }

  private setWidgetSelectedStrokeCount(widget: Entity, count: number): void {
    if (Number(widget.getValue(SelectionWidget, "selectedStrokeCount")) !== count) {
      widget.setValue(SelectionWidget, "selectedStrokeCount", count);
    }
  }

  private getSelectionStateEntity(): Entity | undefined {
    const next = this.queries.selectionState.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getSelectionWidgetEntity(): Entity | undefined {
    const next = this.queries.widgets.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushCatalogState,
  BrushSettings,
  InputCommandState,
} from "../components/core.js";
import {
  OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  initialOpenBrushIndex,
  openBrushInventory,
  openBrushInventorySummary,
  resolveSelectableBrushIndex,
  selectableOpenBrushes,
} from "../brushes/brush-catalog.js";
import {
  findBrushByGuid,
  type BrushInventoryEntry,
} from "../brushes/brush-inventory.js";
import {
  normalizeBrushSize,
  resolveBrushSizeForBrushChange,
} from "../brushes/brush-size.js";

export class BrushCatalogSystem extends createSystem({
  commands: { required: [InputCommandState] },
  settings: { required: [BrushSettings] },
  catalog: { required: [BrushCatalogState] },
}) {
  private activeIndex = initialOpenBrushIndex;
  private lastBrushGuid: string | undefined;

  init() {
    for (const entity of this.queries.catalog.entities) {
      this.applyCatalogState(entity, selectableOpenBrushes[this.activeIndex]);
    }
  }

  update() {
    const settingsEntity = this.getFirstEntity("settings");
    const commandEntity = this.getFirstEntity("commands");
    if (!settingsEntity) {
      return;
    }

    const currentBrushGuid = String(
      settingsEntity.getValue(BrushSettings, "brushGuid"),
    );
    this.activeIndex = resolveSelectableBrushIndex(
      currentBrushGuid,
      this.activeIndex,
    );

    if (commandEntity?.getValue(InputCommandState, "brushNextDown")) {
      this.activeIndex = (this.activeIndex + 1) % selectableOpenBrushes.length;
      this.applyActiveBrush(settingsEntity);
    } else if (commandEntity?.getValue(InputCommandState, "brushPreviousDown")) {
      this.activeIndex =
        (this.activeIndex - 1 + selectableOpenBrushes.length) %
        selectableOpenBrushes.length;
      this.applyActiveBrush(settingsEntity);
    }

    // Like Open Brush, keep the absolute brush size across brush switches
    // (clamped into the new brush's range) instead of re-deriving it from the
    // normalized slider — a mid-range slider means very different absolute
    // sizes per brush. Covers both panel cycling and external guid writes.
    const guidNow = String(settingsEntity.getValue(BrushSettings, "brushGuid"));
    if (guidNow !== this.lastBrushGuid) {
      const brushNow =
        findBrushByGuid(openBrushInventory, guidNow) ??
        selectableOpenBrushes[this.activeIndex];
      this.applySizeForBrushChange(settingsEntity, brushNow);
      this.lastBrushGuid = guidNow;
    }

    const activeBrush = selectableOpenBrushes[this.activeIndex];
    for (const entity of this.queries.catalog.entities) {
      this.applyCatalogState(entity, activeBrush);
    }
  }

  private applyActiveBrush(settingsEntity: Entity): void {
    const activeBrush = selectableOpenBrushes[this.activeIndex];
    settingsEntity.setValue(BrushSettings, "brushGuid", activeBrush.guid);
  }

  private applySizeForBrushChange(
    settingsEntity: Entity,
    activeBrush: BrushInventoryEntry | undefined,
  ): void {
    const resolved = resolveBrushSizeForBrushChange(
      normalizeBrushSize(Number(settingsEntity.getValue(BrushSettings, "size"))),
      activeBrush?.brushSizeRange,
    );
    settingsEntity.setValue(BrushSettings, "size01", resolved.size01);
    settingsEntity.setValue(BrushSettings, "size", resolved.size);
  }

  private applyCatalogState(
    entity: Entity,
    activeBrush: BrushInventoryEntry | undefined,
  ): void {
    const brush =
      activeBrush ?? findBrushByGuid(openBrushInventory, OPEN_BRUSH_DEFAULT_BRUSH_GUID);
    entity.setValue(BrushCatalogState, "activeBrushIndex", this.activeIndex);
    entity.setValue(BrushCatalogState, "brushCount", openBrushInventory.length);
    entity.setValue(
      BrushCatalogState,
      "supportedBrushCount",
      openBrushInventorySummary.supported,
    );
    entity.setValue(
      BrushCatalogState,
      "fallbackBrushCount",
      openBrushInventorySummary.fallback,
    );
    entity.setValue(
      BrushCatalogState,
      "unsupportedBrushCount",
      openBrushInventorySummary.unsupported,
    );
    entity.setValue(BrushCatalogState, "activeBrushName", brush?.name ?? "");
    entity.setValue(
      BrushCatalogState,
      "activeGeometryFamily",
      brush?.geometryFamily ?? "unsupported",
    );
    entity.setValue(
      BrushCatalogState,
      "activeMaterialFamily",
      brush?.materialFamily ?? "fallback",
    );
    entity.setValue(BrushCatalogState, "warning", brush?.unsupportedReason ?? "");
  }

  private getFirstEntity(
    queryName: "commands" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

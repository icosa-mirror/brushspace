import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushCatalogState,
  BrushSettings,
  InputCommandState,
} from "../components/OpenBrushCore.js";
import {
  OPEN_BRUSH_DEFAULT_BRUSH_GUID,
  initialOpenBrushIndex,
  openBrushInventory,
  openBrushInventorySummary,
  resolveSelectableBrushIndex,
  selectableOpenBrushes,
} from "../openbrush/brush-catalog.js";
import {
  findBrushByGuid,
  type BrushInventoryEntry,
} from "../openbrush/brush-inventory.js";
import {
  brushSize01ToLiveBrushSize,
  normalizeBrushSize01,
} from "../openbrush/brush-size.js";

export class BrushCatalogSystem extends createSystem({
  commands: { required: [InputCommandState] },
  settings: { required: [BrushSettings] },
  catalog: { required: [BrushCatalogState] },
}) {
  private activeIndex = initialOpenBrushIndex;

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

    const activeBrush = selectableOpenBrushes[this.activeIndex];
    this.syncBrushSize(settingsEntity, activeBrush);
    for (const entity of this.queries.catalog.entities) {
      this.applyCatalogState(entity, activeBrush);
    }
  }

  private applyActiveBrush(settingsEntity: Entity): void {
    const activeBrush = selectableOpenBrushes[this.activeIndex];
    settingsEntity.setValue(BrushSettings, "brushGuid", activeBrush.guid);
    this.syncBrushSize(settingsEntity, activeBrush);
  }

  private syncBrushSize(
    settingsEntity: Entity,
    activeBrush: BrushInventoryEntry | undefined,
  ): void {
    const size01 = normalizeBrushSize01(
      Number(settingsEntity.getValue(BrushSettings, "size01")),
    );
    const liveSize = brushSize01ToLiveBrushSize(
      size01,
      activeBrush?.brushSizeRange,
    );
    settingsEntity.setValue(BrushSettings, "size01", size01);
    settingsEntity.setValue(BrushSettings, "size", liveSize);
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

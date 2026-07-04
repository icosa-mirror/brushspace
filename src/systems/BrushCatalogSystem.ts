import { createSystem } from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import referenceManifest from "../../reference/Support/exportManifest.json";

import {
  BrushCatalogState,
  BrushSettings,
  InputCommandState,
} from "../components/OpenBrushCore.js";
import {
  buildBrushInventoryFromExportManifest,
  findBrushByGuid,
  summarizeBrushInventory,
  type BrushInventoryEntry,
  type OpenBrushExportManifest,
} from "../openbrush/brush-inventory.js";
import { PHASE1_FIXTURE_BRUSH_GUID } from "../openbrush/fixtures.js";

const brushInventory = buildBrushInventoryFromExportManifest(
  referenceManifest as unknown as OpenBrushExportManifest,
);
const brushSummary = summarizeBrushInventory(brushInventory);
const selectableBrushes = brushInventory.filter(
  (entry) => entry.supportStatus !== "unsupported",
);

export class BrushCatalogSystem extends createSystem({
  commands: { required: [InputCommandState] },
  settings: { required: [BrushSettings] },
  catalog: { required: [BrushCatalogState] },
}) {
  private activeIndex = Math.max(
    0,
    selectableBrushes.findIndex((entry) => entry.guid === PHASE1_FIXTURE_BRUSH_GUID),
  );

  init() {
    for (const entity of this.queries.catalog.entities) {
      this.applyCatalogState(entity, selectableBrushes[this.activeIndex]);
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
    this.activeIndex = this.resolveActiveIndex(currentBrushGuid);

    if (commandEntity?.getValue(InputCommandState, "brushNextDown")) {
      this.activeIndex = (this.activeIndex + 1) % selectableBrushes.length;
      this.applyActiveBrush(settingsEntity);
    } else if (commandEntity?.getValue(InputCommandState, "brushPreviousDown")) {
      this.activeIndex =
        (this.activeIndex - 1 + selectableBrushes.length) % selectableBrushes.length;
      this.applyActiveBrush(settingsEntity);
    }

    const activeBrush = selectableBrushes[this.activeIndex];
    for (const entity of this.queries.catalog.entities) {
      this.applyCatalogState(entity, activeBrush);
    }
  }

  private applyActiveBrush(settingsEntity: Entity): void {
    const activeBrush = selectableBrushes[this.activeIndex];
    settingsEntity.setValue(BrushSettings, "brushGuid", activeBrush.guid);
  }

  private applyCatalogState(
    entity: Entity,
    activeBrush: BrushInventoryEntry | undefined,
  ): void {
    const brush = activeBrush ?? findBrushByGuid(brushInventory, PHASE1_FIXTURE_BRUSH_GUID);
    entity.setValue(BrushCatalogState, "activeBrushIndex", this.activeIndex);
    entity.setValue(BrushCatalogState, "brushCount", brushInventory.length);
    entity.setValue(
      BrushCatalogState,
      "supportedBrushCount",
      brushSummary.supported,
    );
    entity.setValue(BrushCatalogState, "fallbackBrushCount", brushSummary.fallback);
    entity.setValue(
      BrushCatalogState,
      "unsupportedBrushCount",
      brushSummary.unsupported,
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

  private resolveActiveIndex(brushGuid: string): number {
    const index = selectableBrushes.findIndex((entry) => entry.guid === brushGuid);
    return index >= 0 ? index : this.activeIndex;
  }

  private getFirstEntity(
    queryName: "commands" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

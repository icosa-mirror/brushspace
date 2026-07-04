import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  VisibilityState,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import { BrushSettings } from "./components/OpenBrushCore.js";
import {
  cycleSelectableBrush,
  openBrushInventorySummary,
  resolveSelectableBrushIndex,
  selectableOpenBrushes,
} from "./openbrush/brush-catalog.js";

type TextElement = UIKit.Text | null;

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
  brushSettings: { required: [BrushSettings] },
}) {
  private readonly initializedPanels = new Set<number>();

  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });
    for (const entity of this.queries.welcomePanel.entities) {
      this.setupPanel(entity);
    }
  }

  update() {
    for (const entity of this.queries.welcomePanel.entities) {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        continue;
      }
      this.updateBrushLabels(document);
    }
  }

  private setupPanel(entity: Entity): void {
    if (this.initializedPanels.has(entity.index)) {
      return;
    }
    const document = PanelDocument.data.document[
      entity.index
    ] as UIKitDocument;
    if (!document) {
      return;
    }
    this.initializedPanels.add(entity.index);

    this.nameElement(document, "xr-button");
    this.nameElement(document, "brush-previous-button");
    this.nameElement(document, "brush-next-button");

    const xrButton = document.getElementById("xr-button") as TextElement;
    xrButton?.addEventListener("click", () => {
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
        this.world.launchXR();
      } else {
        this.world.exitXR();
      }
    });
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        if (visibilityState === VisibilityState.NonImmersive) {
          xrButton?.setProperties({ text: "Enter XR" });
        } else {
          xrButton?.setProperties({ text: "Exit to Browser" });
        }
      }),
    );

    const previousBrushButton = document.getElementById(
      "brush-previous-button",
    ) as TextElement;
    previousBrushButton?.addEventListener("click", () => {
      this.selectBrushOffset(-1);
    });

    const nextBrushButton = document.getElementById(
      "brush-next-button",
    ) as TextElement;
    nextBrushButton?.addEventListener("click", () => {
      this.selectBrushOffset(1);
    });
    this.updateBrushLabels(document);
  }

  private selectBrushOffset(offset: number): void {
    const settingsEntity = this.getBrushSettingsEntity();
    if (!settingsEntity) {
      return;
    }
    const currentBrushGuid = String(
      settingsEntity.getValue(BrushSettings, "brushGuid"),
    );
    const nextBrush = cycleSelectableBrush(currentBrushGuid, offset);
    settingsEntity.setValue(BrushSettings, "brushGuid", nextBrush.guid);
  }

  private updateBrushLabels(document: UIKitDocument): void {
    const settingsEntity = this.getBrushSettingsEntity();
    const activeBrushGuid = settingsEntity
      ? String(settingsEntity.getValue(BrushSettings, "brushGuid"))
      : "";
    const activeIndex = resolveSelectableBrushIndex(activeBrushGuid);
    const activeBrush = selectableOpenBrushes[activeIndex];
    const catalogPosition = `${activeIndex + 1}/${selectableOpenBrushes.length}`;

    this.setText(document, "active-brush-name", activeBrush?.name ?? "No brush");
    this.setText(
      document,
      "active-brush-meta",
      activeBrush
        ? `${activeBrush.geometryFamily} / ${activeBrush.materialFamily} / ${catalogPosition}`
        : "unavailable",
    );
    this.setText(
      document,
      "brush-catalog-counts",
      `${openBrushInventorySummary.supported} supported | ${openBrushInventorySummary.fallback} fallback | ${openBrushInventorySummary.unsupported} pending`,
    );
    this.setText(
      document,
      "brush-warning",
      activeBrush?.unsupportedReason ?? "Ready",
    );
  }

  private setText(document: UIKitDocument, id: string, text: string): void {
    const element = document.getElementById(id) as TextElement;
    element?.setProperties({ text });
  }

  private nameElement(document: UIKitDocument, id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.name = id;
    }
  }

  private getBrushSettingsEntity(): Entity | undefined {
    const next = this.queries.brushSettings.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

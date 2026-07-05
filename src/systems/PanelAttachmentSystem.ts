import {
  PanelUI,
  Transform,
  VisibilityState,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  OpenBrushPanelAttachment,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  createOpenBrushPanelAttachmentPose,
  resolveOpenBrushPanelAttachmentPoseInto,
  type OpenBrushPanelAttachmentSettings,
  type OpenBrushPanelAttachmentTarget,
} from "../openbrush/panel-attachment.js";

const BASE_PANEL_MAX_WIDTH = 1.6;
const BASE_PANEL_MAX_HEIGHT = 5;
const UNIT_SCALE = [1, 1, 1] as const;

export class PanelAttachmentSystem extends createSystem({
  panels: { required: [PanelUI, Transform, OpenBrushPanelAttachment] },
  settings: { required: [SettingsState] },
}) {
  private readonly pose = createOpenBrushPanelAttachmentPose();
  private readonly settingsSnapshot: OpenBrushPanelAttachmentSettings = {
    dominantHand: "right",
    panelAnchor: "off-hand",
    panelScale: 1,
    panelDistance: 0.9,
    panelHeight: 1.15,
  };

  update(): void {
    const settings = this.getSettingsEntity();
    if (!settings) {
      return;
    }

    for (const panel of this.queries.panels.entities) {
      if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
        this.applyBrowserFallback(panel);
      } else {
        this.applyXrAttachment(panel, settings);
      }
    }
  }

  private applyBrowserFallback(panel: Entity): void {
    this.writeAttachmentStatus(panel, "off-hand", "none", "browser");
  }

  private applyXrAttachment(panel: Entity, settings: Entity): void {
    this.settingsSnapshot.dominantHand = String(
      settings.getValue(SettingsState, "dominantHand"),
    );
    this.settingsSnapshot.panelAnchor = String(
      settings.getValue(SettingsState, "panelAnchor"),
    );
    this.settingsSnapshot.panelScale = Number(
      settings.getValue(SettingsState, "panelScale"),
    );
    this.settingsSnapshot.panelDistance = Number(
      settings.getValue(SettingsState, "panelDistance"),
    );
    this.settingsSnapshot.panelHeight = Number(
      settings.getValue(SettingsState, "panelHeight"),
    );
    const pose = resolveOpenBrushPanelAttachmentPoseInto(
      this.settingsSnapshot,
      this.pose,
    );
    this.setParent(panel, this.resolveParentEntity(pose.target));
    this.writeTransform(panel, pose.position, pose.orientation);
    this.writePanelSize(panel, pose.scale[0]);
    this.writeAttachmentStatus(
      panel,
      pose.anchor,
      pose.hand,
      pose.status,
      Number(settings.getValue(SettingsState, "settingsRevision")),
    );
  }

  private resolveParentEntity(target: OpenBrushPanelAttachmentTarget): Entity {
    switch (target) {
      case "left-ray":
        return this.world.playerSpaceEntities.raySpaces.left;
      case "right-ray":
        return this.world.playerSpaceEntities.raySpaces.right;
      case "xr-origin":
      default:
        return this.world.playerEntity;
    }
  }

  private writeTransform(
    entity: Entity,
    position: readonly [number, number, number],
    orientation: readonly [number, number, number, number],
  ): void {
    const positionView = entity.getVectorView(
      Transform,
      "position",
    ) as Float32Array;
    positionView[0] = position[0];
    positionView[1] = position[1];
    positionView[2] = position[2];

    const orientationView = entity.getVectorView(
      Transform,
      "orientation",
    ) as Float32Array;
    orientationView[0] = orientation[0];
    orientationView[1] = orientation[1];
    orientationView[2] = orientation[2];
    orientationView[3] = orientation[3];

    const scaleView = entity.getVectorView(Transform, "scale") as Float32Array;
    scaleView[0] = UNIT_SCALE[0];
    scaleView[1] = UNIT_SCALE[1];
    scaleView[2] = UNIT_SCALE[2];
  }

  private setParent(entity: Entity, parent: Entity): void {
    if (entity.getValue(Transform, "parent") !== parent) {
      entity.setValue(Transform, "parent", parent);
    }
  }

  private writePanelSize(entity: Entity, scale: number): void {
    const maxWidth = BASE_PANEL_MAX_WIDTH * scale;
    if (Number(entity.getValue(PanelUI, "maxWidth")) !== maxWidth) {
      entity.setValue(PanelUI, "maxWidth", maxWidth);
    }
    const maxHeight = BASE_PANEL_MAX_HEIGHT * scale;
    if (Number(entity.getValue(PanelUI, "maxHeight")) !== maxHeight) {
      entity.setValue(PanelUI, "maxHeight", maxHeight);
    }
  }

  private writeAttachmentStatus(
    entity: Entity,
    anchor: string,
    hand: string,
    status: string,
    settingsRevision = -1,
  ): void {
    if (String(entity.getValue(OpenBrushPanelAttachment, "anchor")) !== anchor) {
      entity.setValue(OpenBrushPanelAttachment, "anchor", anchor);
    }
    if (String(entity.getValue(OpenBrushPanelAttachment, "hand")) !== hand) {
      entity.setValue(OpenBrushPanelAttachment, "hand", hand);
    }
    if (String(entity.getValue(OpenBrushPanelAttachment, "status")) !== status) {
      entity.setValue(OpenBrushPanelAttachment, "status", status);
    }
    if (
      Number(
        entity.getValue(OpenBrushPanelAttachment, "appliedSettingsRevision"),
      ) !== settingsRevision
    ) {
      entity.setValue(
        OpenBrushPanelAttachment,
        "appliedSettingsRevision",
        settingsRevision,
      );
    }
  }

  private getSettingsEntity(): Entity | undefined {
    const next = this.queries.settings.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

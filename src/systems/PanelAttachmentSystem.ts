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
  type OpenBrushPanelMode,
  type OpenBrushPanelRole,
} from "../openbrush/panel-attachment.js";

const BASE_PANEL_MAX_WIDTH = 1.6;
const BASE_PANEL_MAX_HEIGHT = 5;
const RING_PANEL_MAX_WIDTH = 0.72;
const RING_PANEL_MAX_HEIGHT = 0.9;
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
    wandPanelRotationSteps: 0,
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
    const role = this.getPanelRole(panel);
    const visible = role === "main";
    this.setObjectVisible(panel, visible);
    this.writeAttachmentStatus(
      panel,
      role,
      role === "main" ? "fallback" : "fixed-ring",
      "off-hand",
      "none",
      visible ? "browser" : "browser-hidden",
      -1,
      0,
      visible,
      -1,
      0,
    );
  }

  private applyXrAttachment(panel: Entity, settings: Entity): void {
    const role = this.getPanelRole(panel);
    if (role === "main") {
      this.setObjectVisible(panel, false);
      this.writeAttachmentStatus(
        panel,
        role,
        "fallback",
        "off-hand",
        "none",
        "xr-hidden",
        -1,
        0,
        false,
        Number(settings.getValue(SettingsState, "settingsRevision")),
        Number(settings.getValue(SettingsState, "wandPanelRotationSteps")),
      );
      return;
    }

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
    this.settingsSnapshot.wandPanelRotationSteps = Number(
      settings.getValue(SettingsState, "wandPanelRotationSteps"),
    );
    const pose = resolveOpenBrushPanelAttachmentPoseInto(
      this.settingsSnapshot,
      role,
      this.pose,
    );
    this.setObjectVisible(panel, pose.visible);
    this.setParent(panel, this.resolveParentEntity(pose.target));
    this.writeTransform(panel, pose.position, pose.orientation);
    this.writePanelSize(panel, pose.scale[0], pose.mode);
    this.writeAttachmentStatus(
      panel,
      pose.role,
      pose.mode,
      pose.anchor,
      pose.hand,
      pose.status,
      pose.slotIndex,
      pose.slotAngleDegrees,
      pose.visible,
      Number(settings.getValue(SettingsState, "settingsRevision")),
      Number(settings.getValue(SettingsState, "wandPanelRotationSteps")),
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

  private writePanelSize(
    entity: Entity,
    scale: number,
    mode: OpenBrushPanelMode,
  ): void {
    const baseWidth =
      mode === "fixed-ring" ? RING_PANEL_MAX_WIDTH : BASE_PANEL_MAX_WIDTH;
    const baseHeight =
      mode === "fixed-ring" ? RING_PANEL_MAX_HEIGHT : BASE_PANEL_MAX_HEIGHT;
    const maxWidth = baseWidth * scale;
    if (Number(entity.getValue(PanelUI, "maxWidth")) !== maxWidth) {
      entity.setValue(PanelUI, "maxWidth", maxWidth);
    }
    const maxHeight = baseHeight * scale;
    if (Number(entity.getValue(PanelUI, "maxHeight")) !== maxHeight) {
      entity.setValue(PanelUI, "maxHeight", maxHeight);
    }
  }

  private writeAttachmentStatus(
    entity: Entity,
    role: string,
    mode: string,
    anchor: string,
    hand: string,
    status: string,
    slotIndex: number,
    slotAngleDegrees: number,
    visible: boolean,
    settingsRevision = -1,
    ringRotationSteps = 0,
  ): void {
    if (String(entity.getValue(OpenBrushPanelAttachment, "role")) !== role) {
      entity.setValue(OpenBrushPanelAttachment, "role", role);
    }
    if (String(entity.getValue(OpenBrushPanelAttachment, "mode")) !== mode) {
      entity.setValue(OpenBrushPanelAttachment, "mode", mode);
    }
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
      Number(entity.getValue(OpenBrushPanelAttachment, "slotIndex")) !== slotIndex
    ) {
      entity.setValue(OpenBrushPanelAttachment, "slotIndex", slotIndex);
    }
    if (
      Number(entity.getValue(OpenBrushPanelAttachment, "slotAngleDegrees")) !==
      slotAngleDegrees
    ) {
      entity.setValue(
        OpenBrushPanelAttachment,
        "slotAngleDegrees",
        slotAngleDegrees,
      );
    }
    if (
      Boolean(entity.getValue(OpenBrushPanelAttachment, "visible")) !== visible
    ) {
      entity.setValue(OpenBrushPanelAttachment, "visible", visible);
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
    if (
      Number(
        entity.getValue(OpenBrushPanelAttachment, "appliedRingRotationSteps"),
      ) !== ringRotationSteps
    ) {
      entity.setValue(
        OpenBrushPanelAttachment,
        "appliedRingRotationSteps",
        ringRotationSteps,
      );
    }
  }

  private getPanelRole(entity: Entity): OpenBrushPanelRole {
    const role = String(entity.getValue(OpenBrushPanelAttachment, "role"));
    if (role === "color" || role === "brush" || role === "tools") {
      return role;
    }
    return "main";
  }

  private setObjectVisible(entity: Entity, visible: boolean): void {
    if (entity.object3D && entity.object3D.visible !== visible) {
      entity.object3D.visible = visible;
    }
  }

  private getSettingsEntity(): Entity | undefined {
    const next = this.queries.settings.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

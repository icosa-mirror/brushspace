import {
  Group,
  PanelUI,
  RayInteractable,
  ScreenSpace,
  Transform,
  VisibilityState,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

import {
  OpenBrushAppState,
  OpenBrushPanelAttachment,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  OPEN_BRUSH_FIXED_WAND_PANEL_ROLES,
  OPEN_BRUSH_WAND_PRISM_ROLE,
  advanceWandPanelRotationSteps,
  createOpenBrushPanelAttachmentPose,
  resolveOpenBrushPanelAttachmentPoseInto,
  resolveOpenBrushWandPrismAttachmentPoseInto,
  resolveOpenBrushWandPrismPanelSlotPoseInto,
  type OpenBrushFixedWandPanelRole,
  type OpenBrushPanelAttachmentSettings,
  type OpenBrushPanelAttachmentTarget,
  type OpenBrushPanelMode,
  type OpenBrushPanelRole,
} from "../openbrush/panel-attachment.js";

const BASE_PANEL_MAX_WIDTH = 1.6;
const BASE_PANEL_MAX_HEIGHT = 5;
const RING_PANEL_MAX_WIDTH = 0.82;
// Taller than wide so the 4x4 brush grid spans the full face width and the
// color face fits the favorites strip below the wheel.
const RING_PANEL_MAX_HEIGHT = 1.04;
const UNIT_SCALE = [1, 1, 1] as const;
const PANEL_BORDER_GROUP_NAME = "OpenBrushWandPanelBorder";
const PANEL_BORDER_Z_OFFSET = 0.002;
const PANEL_BORDER_RENDER_ORDER = 30;
const PANEL_BORDER_LINEWIDTH = 0.0022;
const PANEL_BORDER_RADIUS = 0.012;
const PANEL_BORDER_CORNER_SEGMENTS = 6;

export class PanelAttachmentSystem extends createSystem({
  attachments: { required: [Transform, OpenBrushPanelAttachment] },
  // Panels are any attached entities except the prism itself; custom panels
  // (e.g. the color picker) participate without a PanelUI component.
  panels: { required: [Transform, OpenBrushPanelAttachment] },
  settings: { required: [SettingsState] },
  appState: { required: [OpenBrushAppState] },
}) {
  private readonly borderMaterial = new LineMaterial({
    color: 0xffffff,
    linewidth: PANEL_BORDER_LINEWIDTH,
    worldUnits: true,
    transparent: false,
    depthTest: true,
  });
  private readonly pose = createOpenBrushPanelAttachmentPose();
  private readonly prismPose = createOpenBrushPanelAttachmentPose();
  private readonly slotPose = createOpenBrushPanelAttachmentPose();
  private readonly settingsSnapshot: OpenBrushPanelAttachmentSettings = {
    dominantHand: "right",
    panelAnchor: "off-hand",
    panelScale: 1,
    panelDistance: 0.9,
    panelHeight: 1.15,
    wandPanelRotationSteps: 0,
  };
  private animatedWandPanelRotationSteps = 0;
  private hasAnimatedWandPanelRotationSteps = false;

  update(deltaSeconds = 1 / 60): void {
    const settings = this.getSettingsEntity();
    if (!settings) {
      return;
    }

    const isBrowser =
      this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    if (!isBrowser) {
      this.advanceWandPanelRotation(settings, deltaSeconds);
    }
    this.readSettingsSnapshot(settings);

    const settingsRevision = Number(
      settings.getValue(SettingsState, "settingsRevision"),
    );
    const prism = this.getWandPrismEntity();

    // In the intro state the sketch-library gallery replaces the wand UI:
    // the prism and every wand panel hide until a sketch is active.
    const introMode = !isBrowser && this.isIntroMode();

    if (prism) {
      if (isBrowser) {
        this.applyBrowserFallback(prism);
      } else if (introMode) {
        this.applyXrIntroHidden(prism, settingsRevision);
      } else {
        this.applyXrWandPrism(prism, settingsRevision);
      }
    }
    for (const panel of this.queries.panels.entities) {
      if (this.getPanelRole(panel) === OPEN_BRUSH_WAND_PRISM_ROLE) {
        continue;
      }
      if (isBrowser) {
        this.applyBrowserFallback(panel);
      } else if (introMode) {
        this.applyXrIntroHidden(panel, settingsRevision);
      } else {
        this.applyXrAttachment(panel, settingsRevision, prism);
      }
    }
  }

  private isIntroMode(): boolean {
    for (const entity of this.queries.appState.entities) {
      return String(entity.getValue(OpenBrushAppState, "mode")) === "intro";
    }
    return false;
  }

  private applyXrIntroHidden(panel: Entity, settingsRevision: number): void {
    this.setObjectVisible(panel, false);
    this.setPanelInteractive(panel, false);
    this.setPanelBorderVisible(panel, false);
    this.writeAttachmentStatus(
      panel,
      this.getPanelRole(panel),
      "fallback",
      "off-hand",
      "none",
      "intro-hidden",
      -1,
      0,
      false,
      settingsRevision,
      this.animatedWandPanelRotationSteps,
    );
  }

  private applyBrowserFallback(panel: Entity): void {
    // Screen-space panels are camera-anchored (ScreenSpaceUISystem owns their
    // pose and visibility); don't fight them from the attachment logic.
    if (panel.hasComponent(ScreenSpace)) {
      return;
    }
    const role = this.getPanelRole(panel);
    const visible = role === "main";
    this.setObjectVisible(panel, visible);
    this.setPanelInteractive(panel, visible);
    this.setPanelBorderVisible(panel, false);
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

  private applyXrWandPrism(prism: Entity, settingsRevision: number): void {
    this.settingsSnapshot.wandPanelRotationSteps =
      this.animatedWandPanelRotationSteps;
    const pose = resolveOpenBrushWandPrismAttachmentPoseInto(
      this.settingsSnapshot,
      this.prismPose,
    );
    this.setObjectVisible(prism, pose.visible);
    this.setParent(prism, this.resolveParentEntity(pose.target));
    this.writeTransform(prism, pose.position, pose.orientation);
    this.writeAttachmentStatus(
      prism,
      pose.role,
      pose.mode,
      pose.anchor,
      pose.hand,
      pose.status,
      pose.slotIndex,
      pose.slotAngleDegrees,
      pose.visible,
      settingsRevision,
      this.animatedWandPanelRotationSteps,
    );
  }

  private applyXrAttachment(
    panel: Entity,
    settingsRevision: number,
    prism: Entity | undefined,
  ): void {
    const role = this.getPanelRole(panel);
    if (role === "main") {
      this.setObjectVisible(panel, false);
      this.setPanelInteractive(panel, false);
      this.setPanelBorderVisible(panel, false);
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
        settingsRevision,
        this.animatedWandPanelRotationSteps,
      );
      return;
    }

    if (!this.isFixedWandPanelRole(role)) {
      return;
    }

    if (prism) {
      const pose = resolveOpenBrushWandPrismPanelSlotPoseInto(
        role,
        this.prismPose.hand,
        this.slotPose,
      );
      this.setObjectVisible(panel, pose.visible);
      this.setPanelInteractive(panel, pose.visible);
      this.setParent(panel, prism);
      this.writeTransform(panel, pose.position, pose.orientation);
      this.writePanelSize(
        panel,
        this.prismPose.scale[0] * pose.scale[0],
        pose.mode,
      );
      this.writeAttachmentStatus(
        panel,
        pose.role,
        pose.mode,
        this.prismPose.anchor,
        this.prismPose.hand,
        this.prismPose.status,
        pose.slotIndex,
        pose.slotAngleDegrees,
        pose.visible,
        settingsRevision,
        this.animatedWandPanelRotationSteps,
      );
      return;
    }

    this.settingsSnapshot.wandPanelRotationSteps =
      this.animatedWandPanelRotationSteps;
    const pose = resolveOpenBrushPanelAttachmentPoseInto(
      this.settingsSnapshot,
      role,
      this.pose,
    );
    this.setObjectVisible(panel, pose.visible);
    this.setPanelInteractive(panel, pose.visible);
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
      settingsRevision,
      this.animatedWandPanelRotationSteps,
    );
  }

  private readSettingsSnapshot(settings: Entity): void {
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
    this.settingsSnapshot.wandPanelRotationSteps =
      this.animatedWandPanelRotationSteps;
  }

  private advanceWandPanelRotation(
    settings: Entity,
    deltaSeconds: number,
  ): void {
    const targetSteps = Number(
      settings.getValue(SettingsState, "wandPanelRotationSteps"),
    );
    if (!this.hasAnimatedWandPanelRotationSteps) {
      this.animatedWandPanelRotationSteps = Number.isFinite(targetSteps)
        ? targetSteps
        : 0;
      this.hasAnimatedWandPanelRotationSteps = true;
      return;
    }
    this.animatedWandPanelRotationSteps = advanceWandPanelRotationSteps(
      this.animatedWandPanelRotationSteps,
      targetSteps,
      deltaSeconds,
    );
  }

  private resolveParentEntity(target: OpenBrushPanelAttachmentTarget): Entity {
    switch (target) {
      case "left-ray":
        return this.world.playerSpaceEntities.raySpaces.left;
      case "right-ray":
        return this.world.playerSpaceEntities.raySpaces.right;
      case "left-grip":
        return this.world.playerSpaceEntities.gripSpaces.left;
      case "right-grip":
        return this.world.playerSpaceEntities.gripSpaces.right;
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
    if (!entity.hasComponent(PanelUI)) {
      // Custom panels author geometry in panel units and take the pose scale
      // directly on their object. The border must render identically to the
      // PanelUI panels (whose roots are unscaled), so build it in world units
      // and cancel the root scale on the border group — corner radius, line
      // width, and z offset are absolute constants.
      const object = entity.object3D;
      object?.scale.setScalar(scale);
      const worldWidth =
        (mode === "fixed-ring" ? RING_PANEL_MAX_WIDTH : BASE_PANEL_MAX_WIDTH) *
        scale;
      const worldHeight =
        (mode === "fixed-ring" ? RING_PANEL_MAX_HEIGHT : BASE_PANEL_MAX_HEIGHT) *
        scale;
      this.syncPanelBorder(entity, worldWidth, worldHeight, mode === "fixed-ring");
      if (object && scale > 0) {
        const border = object.getObjectByName(PANEL_BORDER_GROUP_NAME);
        if (border) {
          const inverseScale = 1 / scale;
          border.scale.setScalar(inverseScale);
          border.position.z = PANEL_BORDER_Z_OFFSET * inverseScale;
        }
      }
      return;
    }
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
    this.syncPanelBorder(entity, maxWidth, maxHeight, mode === "fixed-ring");
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

  private getWandPrismEntity(): Entity | undefined {
    for (const entity of this.queries.attachments.entities) {
      if (this.getPanelRole(entity) === OPEN_BRUSH_WAND_PRISM_ROLE) {
        return entity;
      }
    }
    return undefined;
  }

  private getPanelRole(entity: Entity): OpenBrushPanelRole {
    const role = String(entity.getValue(OpenBrushPanelAttachment, "role"));
    if (
      role === "color" ||
      role === "brush" ||
      role === "tools" ||
      role === OPEN_BRUSH_WAND_PRISM_ROLE
    ) {
      return role;
    }
    return "main";
  }

  private isFixedWandPanelRole(
    role: OpenBrushPanelRole,
  ): role is OpenBrushFixedWandPanelRole {
    return OPEN_BRUSH_FIXED_WAND_PANEL_ROLES.includes(
      role as OpenBrushFixedWandPanelRole,
    );
  }

  private setObjectVisible(entity: Entity, visible: boolean): void {
    if (entity.object3D && entity.object3D.visible !== visible) {
      entity.object3D.visible = visible;
    }
  }

  private setPanelInteractive(entity: Entity, interactive: boolean): void {
    if (interactive) {
      if (!entity.hasComponent(RayInteractable)) {
        entity.addComponent(RayInteractable);
      }
      return;
    }
    if (entity.hasComponent(RayInteractable)) {
      entity.removeComponent(RayInteractable);
    }
  }

  private setPanelBorderVisible(entity: Entity, visible: boolean): void {
    const border = entity.object3D?.getObjectByName(PANEL_BORDER_GROUP_NAME);
    if (border) {
      border.visible = visible;
    }
  }

  private syncPanelBorder(
    entity: Entity,
    width: number,
    height: number,
    visible: boolean,
  ): void {
    const object = entity.object3D;
    if (!object) {
      return;
    }
    const border = this.getOrCreatePanelBorder(object);
    border.visible = visible;
    if (!visible) {
      return;
    }

    const outline = border.children[0] as LineSegments2;
    this.writeBorderOutline(outline, width, height);
  }

  private getOrCreatePanelBorder(object: NonNullable<Entity["object3D"]>): Group {
    const existing = object.getObjectByName(PANEL_BORDER_GROUP_NAME);
    if (existing instanceof Group) {
      return existing;
    }

    const border = new Group();
    border.name = PANEL_BORDER_GROUP_NAME;
    border.position.z = PANEL_BORDER_Z_OFFSET;
    const geometry = new LineSegmentsGeometry();
    this.markGeometryNonInteractive(geometry);
    const outline = new LineSegments2(geometry, this.borderMaterial);
    outline.name = "OpenBrushWandPanelBorder_outline";
    outline.renderOrder = PANEL_BORDER_RENDER_ORDER;
    outline.raycast = () => {};
    border.add(outline);
    object.add(border);
    return border;
  }

  private writeBorderOutline(
    outline: LineSegments2,
    width: number,
    height: number,
  ): void {
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    const radius = Math.min(PANEL_BORDER_RADIUS, halfWidth, halfHeight);
    const geometry = outline.geometry as LineSegmentsGeometry;
    const positions = this.buildRoundedBorderSegments(
      halfWidth,
      halfHeight,
      radius,
    );
    geometry.setPositions(positions);
    this.markGeometryNonInteractive(geometry);
    geometry.computeBoundingSphere();
  }

  private buildRoundedBorderSegments(
    halfWidth: number,
    halfHeight: number,
    radius: number,
  ): Float32Array {
    const points: Array<[number, number]> = [];
    this.pushCornerPoints(
      points,
      halfWidth - radius,
      halfHeight - radius,
      radius,
      0,
      Math.PI * 0.5,
    );
    this.pushCornerPoints(
      points,
      -halfWidth + radius,
      halfHeight - radius,
      radius,
      Math.PI * 0.5,
      Math.PI,
    );
    this.pushCornerPoints(
      points,
      -halfWidth + radius,
      -halfHeight + radius,
      radius,
      Math.PI,
      Math.PI * 1.5,
    );
    this.pushCornerPoints(
      points,
      halfWidth - radius,
      -halfHeight + radius,
      radius,
      Math.PI * 1.5,
      Math.PI * 2,
    );

    const positions = new Float32Array(points.length * 6);
    for (let index = 0; index < points.length; index++) {
      const [ax, ay] = points[index]!;
      const [bx, by] = points[(index + 1) % points.length]!;
      const offset = index * 6;
      positions[offset] = ax;
      positions[offset + 1] = ay;
      positions[offset + 2] = 0;
      positions[offset + 3] = bx;
      positions[offset + 4] = by;
      positions[offset + 5] = 0;
    }
    return positions;
  }

  private pushCornerPoints(
    points: Array<[number, number]>,
    centerX: number,
    centerY: number,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): void {
    for (let index = 0; index <= PANEL_BORDER_CORNER_SEGMENTS; index++) {
      if (points.length > 0 && index === 0) {
        continue;
      }
      const alpha = index / PANEL_BORDER_CORNER_SEGMENTS;
      const angle = startAngle + (endAngle - startAngle) * alpha;
      points.push([
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
      ]);
    }
  }

  private markGeometryNonInteractive(geometry: LineSegmentsGeometry): void {
    // IWSDK's ray BVH path expects triangle geometry. These decorative lines
    // never raycast, so mirror the sentinel approach used by ../blocks.
    (geometry as unknown as { boundsTree: LineSegmentsGeometry }).boundsTree =
      geometry;
  }

  private getSettingsEntity(): Entity | undefined {
    const next = this.queries.settings.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

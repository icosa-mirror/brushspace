import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PanelUI,
  Quaternion,
  Vector3,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushPointer,
  BrushSettings,
  BrushStroke,
  CanvasLayer,
  InputCommandState,
  OpenBrushAppState,
  StrokeHistoryState,
} from "../components/OpenBrushCore.js";
import { openBrushInventory } from "../openbrush/brush-catalog.js";
import {
  findBrushByGuid,
  type BrushGeometryFamily,
} from "../openbrush/brush-inventory.js";
import { generateBrushGeometry } from "../openbrush/brush-geometry.js";
import { createBrushMaterialSpec } from "../openbrush/brush-materials.js";
import {
  shouldSampleControlPoint,
  upsertStraightedgeEndpoint,
  type StrokePointerFrame,
} from "../openbrush/stroke-authoring.js";
import {
  resolveOpenBrushTool,
  type OpenBrushToolDescriptor,
  type OpenBrushToolId,
  type OpenBrushToolSamplingMode,
} from "../openbrush/tools.js";
import {
  createEmptyStrokeData,
  type ControlPoint,
  type Rgba,
  type StrokeData,
  type Vec3,
} from "../openbrush/types.js";

const MIN_SAMPLE_DISTANCE = 0.015;

interface RuntimeStroke {
  entity: Entity;
  mesh: Mesh;
  geometry: BufferGeometry;
  geometryFamily: BrushGeometryFamily;
  toolId: OpenBrushToolId;
  groupId: number;
  samplingMode: OpenBrushToolSamplingMode;
  strokeData: StrokeData;
  controlPoints: ControlPoint[];
  lastPosition: Vec3;
  minBounds: Float32Array;
  maxBounds: Float32Array;
}

export class StrokeAuthoringSystem extends createSystem({
  commands: { required: [InputCommandState] },
  appState: { required: [OpenBrushAppState] },
  brushSettings: { required: [BrushSettings] },
  pointers: { required: [BrushPointer] },
  history: { required: [StrokeHistoryState] },
  layers: { required: [CanvasLayer] },
  hoveredPanels: { required: [PanelUI, Hovered] },
  panels: { required: [PanelUI] },
}) {
  private readonly samplePosition = new Vector3();
  private readonly sampleQuaternion = new Quaternion();
  private readonly cameraPosition = new Vector3();
  private readonly sampleDirection = new Vector3();
  private readonly sampleNdc = new Vector3();
  private readonly panelPosition = new Vector3();
  private readonly panelQuaternion = new Quaternion();
  private readonly panelRight = new Vector3();
  private readonly panelUp = new Vector3();
  private readonly panelNormal = new Vector3();
  private readonly panelDelta = new Vector3();
  private readonly panelHit = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly sampleFrame: StrokePointerFrame = {
    paintPressed: true,
    pressure: 0,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    timestampMs: 0,
  };
  private activeStroke: RuntimeStroke | undefined;
  private strokeCounter = 0;
  private readonly undoStack: Entity[] = [];
  private readonly redoStack: Entity[] = [];

  update(_delta: number, time: number) {
    const commandEntity = this.getFirstEntity("commands");
    if (!commandEntity) {
      return;
    }

    if (commandEntity.getValue(InputCommandState, "undoDown")) {
      this.undoLastStroke();
    }
    if (commandEntity.getValue(InputCommandState, "redoDown")) {
      this.redoLastStroke();
    }

    const rawPaintPressed = Boolean(
      commandEntity.getValue(InputCommandState, "paintPressed"),
    );
    if (rawPaintPressed) {
      this.samplePointerPose(commandEntity);
    }
    const commandSource = String(commandEntity.getValue(InputCommandState, "source"));
    const paintPressed =
      rawPaintPressed &&
      (!!this.activeStroke || !this.isPaintStartBlocked(commandSource));
    if (paintPressed) {
      const pressure = Number(commandEntity.getValue(InputCommandState, "pressure"));
      if (!this.activeStroke) {
        this.startStroke(commandEntity, time, pressure);
      } else if (this.activeStroke.samplingMode === "straightedge") {
        this.sampleStraightedgeStroke(time, pressure);
      } else {
        this.sampleActiveStroke(time, pressure, false);
      }
    } else if (this.activeStroke) {
      this.finalizeActiveStroke();
    }

    this.updateHistoryState();
  }

  private isHoveringPanel(): boolean {
    return this.queries.hoveredPanels.entities.size > 0;
  }

  private isPaintStartBlocked(commandSource: string): boolean {
    if (!this.isActiveToolPaintTool()) {
      return true;
    }
    if (!this.isActiveLayerPaintable()) {
      return true;
    }
    if (this.isHoveringPanel()) {
      return true;
    }
    if (commandSource !== "xr-right" && commandSource !== "xr-left") {
      return false;
    }
    return this.isPointerRayIntersectingPanel();
  }

  private isActiveToolPaintTool(): boolean {
    return this.getActiveTool().paints;
  }

  private isActiveLayerPaintable(): boolean {
    const appStateEntity = this.getFirstEntity("appState");
    const activeLayerIndex = appStateEntity
      ? Number(appStateEntity.getValue(OpenBrushAppState, "activeLayerIndex"))
      : 0;

    for (const layer of this.queries.layers.entities) {
      if (
        !layer.getValue(CanvasLayer, "selectionCanvas") &&
        Number(layer.getValue(CanvasLayer, "layerIndex")) === activeLayerIndex
      ) {
        return (
          Boolean(layer.getValue(CanvasLayer, "visible")) &&
          !Boolean(layer.getValue(CanvasLayer, "locked"))
        );
      }
    }
    return false;
  }

  private isPointerRayIntersectingPanel(): boolean {
    this.rayDirection
      .set(0, 0, -1)
      .applyQuaternion(this.sampleQuaternion)
      .normalize();

    for (const entity of this.queries.panels.entities) {
      const panelObject = entity.object3D;
      if (!panelObject) {
        continue;
      }

      panelObject.getWorldPosition(this.panelPosition);
      panelObject.getWorldQuaternion(this.panelQuaternion);
      this.panelRight.set(1, 0, 0).applyQuaternion(this.panelQuaternion);
      this.panelUp.set(0, 1, 0).applyQuaternion(this.panelQuaternion);
      this.panelNormal.set(0, 0, 1).applyQuaternion(this.panelQuaternion);

      const denominator = this.rayDirection.dot(this.panelNormal);
      if (Math.abs(denominator) < 0.0001) {
        continue;
      }

      this.panelDelta.copy(this.panelPosition).sub(this.samplePosition);
      const distance = this.panelDelta.dot(this.panelNormal) / denominator;
      if (distance < 0) {
        continue;
      }

      this.panelHit
        .copy(this.samplePosition)
        .addScaledVector(this.rayDirection, distance);
      this.panelDelta.copy(this.panelHit).sub(this.panelPosition);

      const localX = this.panelDelta.dot(this.panelRight);
      const localY = this.panelDelta.dot(this.panelUp);
      const halfWidth = Number(entity.getValue(PanelUI, "maxWidth")) * 0.5;
      const halfHeight = Number(entity.getValue(PanelUI, "maxHeight")) * 0.5;
      if (Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight) {
        return true;
      }
    }

    return false;
  }

  private startStroke(
    commandEntity: Entity,
    time: number,
    pressure: number,
  ): void {
    const settingsEntity = this.getFirstEntity("brushSettings");
    const appStateEntity = this.getFirstEntity("appState");
    const brushGuid = settingsEntity
      ? String(settingsEntity.getValue(BrushSettings, "brushGuid"))
      : "";
    const brushSize = settingsEntity
      ? Number(settingsEntity.getValue(BrushSettings, "size"))
      : 0.42;
    const color = this.getBrushColor(settingsEntity);
    const layerIndex = appStateEntity
      ? Number(appStateEntity.getValue(OpenBrushAppState, "activeLayerIndex"))
      : 0;
    const brushEntry = findBrushByGuid(openBrushInventory, brushGuid);
    const geometryFamily = brushEntry?.geometryFamily ?? "unsupported";
    const materialSpec = createBrushMaterialSpec(brushEntry, color);
    const activeTool = this.getActiveTool();

    this.strokeCounter += 1;
    const guid = `runtime-stroke-${this.strokeCounter}`;
    const groupId = this.strokeCounter;
    const strokeData = createEmptyStrokeData({
      guid,
      brushGuid,
      brushSize,
      brushScale: 1,
      color,
      layerIndex,
      seed: this.strokeCounter,
      groupId,
      controlPoints: [],
    });
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial({
      vertexColors: materialSpec.vertexColors,
      side: materialSpec.doubleSided ? DoubleSide : undefined,
      opacity: color[3],
      transparent: materialSpec.transparent,
      depthWrite: materialSpec.depthWrite,
      alphaTest: materialSpec.alphaCutoff,
      blending:
        materialSpec.blending === "additive" ? AdditiveBlending : NormalBlending,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = `OpenBrushStrokeMesh_${this.strokeCounter}`;

    const entity = this.world.createTransformEntity(mesh);
    entity.object3D!.name = `OpenBrushStroke_${this.strokeCounter}`;
    entity.addComponent(BrushStroke, {
      guid,
      brushGuid,
      toolId: activeTool.id,
      groupId,
      groupContinuation: false,
      geometryFamily,
      materialFamily: materialSpec.materialFamily,
      renderWarning: materialSpec.warning ?? "",
      layerIndex,
      brushSize,
      color,
      finalized: false,
      visible: true,
      renderVisible: true,
      selected: false,
      controlPointCount: 0,
      vertexCount: 0,
      indexCount: 0,
      commandIndex: this.strokeCounter,
    });

    const stroke: RuntimeStroke = {
      entity,
      mesh,
      geometry,
      geometryFamily,
      toolId: activeTool.id,
      groupId,
      samplingMode: activeTool.samplingMode,
      strokeData,
      controlPoints: strokeData.controlPoints,
      lastPosition: [0, 0, 0],
      minBounds: entity.getVectorView(BrushStroke, "minBounds") as Float32Array,
      maxBounds: entity.getVectorView(BrushStroke, "maxBounds") as Float32Array,
    };
    this.activeStroke = stroke;
    this.redoStack.length = 0;
    this.sampleActiveStroke(time, pressure, true);
    this.setActivePointerSampleCount(commandEntity);
  }

  private sampleActiveStroke(
    time: number,
    pressure: number,
    force: boolean,
  ): void {
    const stroke = this.activeStroke;
    if (!stroke) {
      return;
    }

    if (
      !force &&
      !shouldSampleControlPoint(
        stroke.lastPosition,
        [this.samplePosition.x, this.samplePosition.y, this.samplePosition.z],
        MIN_SAMPLE_DISTANCE,
      )
    ) {
      return;
    }

    const index = stroke.controlPoints.length;
    stroke.lastPosition[0] = this.samplePosition.x;
    stroke.lastPosition[1] = this.samplePosition.y;
    stroke.lastPosition[2] = this.samplePosition.z;

    const controlPoint: ControlPoint = {
      position: [
        this.samplePosition.x,
        this.samplePosition.y,
        this.samplePosition.z,
      ],
      orientation: [
        this.sampleQuaternion.x,
        this.sampleQuaternion.y,
        this.sampleQuaternion.z,
        this.sampleQuaternion.w,
      ],
      pressure,
      timestampMs: Math.round(time * 1000),
    };
    stroke.controlPoints.push(controlPoint);
    this.updateBounds(stroke, index);
    this.rebuildStrokeMesh(stroke);
    stroke.entity.setValue(
      BrushStroke,
      "controlPointCount",
      stroke.controlPoints.length,
    );
    this.setPointerSampleCount(stroke.controlPoints.length);
  }

  private sampleStraightedgeStroke(time: number, pressure: number): void {
    const stroke = this.activeStroke;
    if (!stroke) {
      return;
    }

    const result = upsertStraightedgeEndpoint(
      stroke.controlPoints,
      this.writeSampleFrame(time, pressure),
      MIN_SAMPLE_DISTANCE,
    );
    if (result === "ignored") {
      return;
    }

    this.recalculateBounds(stroke);
    this.rebuildStrokeMesh(stroke);
    stroke.entity.setValue(
      BrushStroke,
      "controlPointCount",
      stroke.controlPoints.length,
    );
    this.setPointerSampleCount(stroke.controlPoints.length);
  }

  private rebuildStrokeMesh(stroke: RuntimeStroke): void {
    const generated = generateBrushGeometry(
      stroke.strokeData,
      stroke.geometryFamily,
    );
    stroke.geometry.setAttribute(
      "position",
      new BufferAttribute(generated.positions, 3),
    );
    stroke.geometry.setAttribute(
      "normal",
      new BufferAttribute(generated.normals, 3),
    );
    stroke.geometry.setAttribute(
      "color",
      new BufferAttribute(generated.colors, 4),
    );
    stroke.geometry.setAttribute("uv", new BufferAttribute(generated.uvs, 2));
    stroke.geometry.setIndex(new BufferAttribute(generated.indices, 1));
    stroke.geometry.setDrawRange(0, generated.indices.length);
    stroke.entity.setValue(
      BrushStroke,
      "vertexCount",
      generated.positions.length / 3,
    );
    stroke.entity.setValue(BrushStroke, "indexCount", generated.indices.length);
    if (generated.warning) {
      stroke.entity.setValue(BrushStroke, "renderWarning", generated.warning);
    }
  }

  private recalculateBounds(stroke: RuntimeStroke): void {
    if (stroke.controlPoints.length === 0) {
      stroke.minBounds[0] = 0;
      stroke.minBounds[1] = 0;
      stroke.minBounds[2] = 0;
      stroke.maxBounds[0] = 0;
      stroke.maxBounds[1] = 0;
      stroke.maxBounds[2] = 0;
      return;
    }

    const first = stroke.controlPoints[0].position;
    stroke.minBounds[0] = first[0];
    stroke.minBounds[1] = first[1];
    stroke.minBounds[2] = first[2];
    stroke.maxBounds[0] = first[0];
    stroke.maxBounds[1] = first[1];
    stroke.maxBounds[2] = first[2];
    for (let index = 1; index < stroke.controlPoints.length; index += 1) {
      const position = stroke.controlPoints[index].position;
      if (position[0] < stroke.minBounds[0]) {
        stroke.minBounds[0] = position[0];
      }
      if (position[1] < stroke.minBounds[1]) {
        stroke.minBounds[1] = position[1];
      }
      if (position[2] < stroke.minBounds[2]) {
        stroke.minBounds[2] = position[2];
      }
      if (position[0] > stroke.maxBounds[0]) {
        stroke.maxBounds[0] = position[0];
      }
      if (position[1] > stroke.maxBounds[1]) {
        stroke.maxBounds[1] = position[1];
      }
      if (position[2] > stroke.maxBounds[2]) {
        stroke.maxBounds[2] = position[2];
      }
    }
  }

  private updateBounds(stroke: RuntimeStroke, index: number): void {
    const x = this.samplePosition.x;
    const y = this.samplePosition.y;
    const z = this.samplePosition.z;
    if (index === 0) {
      stroke.minBounds[0] = x;
      stroke.minBounds[1] = y;
      stroke.minBounds[2] = z;
      stroke.maxBounds[0] = x;
      stroke.maxBounds[1] = y;
      stroke.maxBounds[2] = z;
      return;
    }

    if (x < stroke.minBounds[0]) {
      stroke.minBounds[0] = x;
    }
    if (y < stroke.minBounds[1]) {
      stroke.minBounds[1] = y;
    }
    if (z < stroke.minBounds[2]) {
      stroke.minBounds[2] = z;
    }
    if (x > stroke.maxBounds[0]) {
      stroke.maxBounds[0] = x;
    }
    if (y > stroke.maxBounds[1]) {
      stroke.maxBounds[1] = y;
    }
    if (z > stroke.maxBounds[2]) {
      stroke.maxBounds[2] = z;
    }
  }

  private finalizeActiveStroke(): void {
    const stroke = this.activeStroke;
    if (!stroke) {
      return;
    }
    if (stroke.samplingMode === "straightedge" && stroke.controlPoints.length < 2) {
      stroke.entity.dispose();
      this.activeStroke = undefined;
      return;
    }
    stroke.entity.setValue(BrushStroke, "finalized", true);
    stroke.entity.setValue(BrushStroke, "visible", true);
    stroke.entity.setValue(BrushStroke, "renderVisible", true);
    this.undoStack.push(stroke.entity);
    this.activeStroke = undefined;
  }

  private undoLastStroke(): void {
    const entity = this.undoStack.pop();
    if (!entity) {
      return;
    }
    entity.setValue(BrushStroke, "visible", false);
    entity.setValue(BrushStroke, "renderVisible", false);
    entity.setValue(BrushStroke, "selected", false);
    if (entity.object3D) {
      entity.object3D.visible = false;
    }
    this.redoStack.push(entity);
  }

  private redoLastStroke(): void {
    const entity = this.redoStack.pop();
    if (!entity) {
      return;
    }
    entity.setValue(BrushStroke, "visible", true);
    entity.setValue(BrushStroke, "renderVisible", true);
    if (entity.object3D) {
      entity.object3D.visible = true;
    }
    this.undoStack.push(entity);
  }

  private samplePointerPose(commandEntity: Entity): void {
    const hand = String(commandEntity.getValue(InputCommandState, "primaryHand"));
    const source = String(commandEntity.getValue(InputCommandState, "source"));
    if (source === "xr-left" || hand === "left") {
      this.world.player.raySpaces.left.getWorldPosition(this.samplePosition);
      this.world.player.raySpaces.left.getWorldQuaternion(this.sampleQuaternion);
      return;
    }
    if (source === "xr-right" || hand === "right") {
      this.world.player.raySpaces.right.getWorldPosition(this.samplePosition);
      this.world.player.raySpaces.right.getWorldQuaternion(this.sampleQuaternion);
      return;
    }

    this.sampleBrowserPointerPose(commandEntity);
  }

  private sampleBrowserPointerPose(commandEntity: Entity): void {
    const canvas = this.world.renderer.domElement;
    const width = canvas.clientWidth || canvas.width || 1;
    const height = canvas.clientHeight || canvas.height || 1;
    const pointerX = Number(commandEntity.getValue(InputCommandState, "pointerX"));
    const pointerY = Number(commandEntity.getValue(InputCommandState, "pointerY"));
    const hasPointer = pointerX !== 0 || pointerY !== 0;
    const normalizedX = hasPointer ? pointerX / width : 0.5;
    const normalizedY = hasPointer ? pointerY / height : 0.5;

    this.sampleNdc.set(normalizedX * 2 - 1, -(normalizedY * 2 - 1), 0.5);
    this.sampleNdc.unproject(this.world.camera);
    this.world.camera.getWorldPosition(this.cameraPosition);
    this.sampleDirection
      .copy(this.sampleNdc)
      .sub(this.cameraPosition)
      .normalize();
    this.samplePosition
      .copy(this.cameraPosition)
      .addScaledVector(this.sampleDirection, 1.5);
    this.world.camera.getWorldQuaternion(this.sampleQuaternion);
  }

  private getBrushColor(settingsEntity: Entity | undefined): Rgba {
    if (!settingsEntity) {
      return [1, 1, 1, 1];
    }
    const colorView = settingsEntity.getVectorView(
      BrushSettings,
      "color",
    ) as Float32Array;
    return [colorView[0], colorView[1], colorView[2], colorView[3]];
  }

  private writeSampleFrame(time: number, pressure: number): StrokePointerFrame {
    this.sampleFrame.pressure = pressure;
    this.sampleFrame.position[0] = this.samplePosition.x;
    this.sampleFrame.position[1] = this.samplePosition.y;
    this.sampleFrame.position[2] = this.samplePosition.z;
    this.sampleFrame.orientation[0] = this.sampleQuaternion.x;
    this.sampleFrame.orientation[1] = this.sampleQuaternion.y;
    this.sampleFrame.orientation[2] = this.sampleQuaternion.z;
    this.sampleFrame.orientation[3] = this.sampleQuaternion.w;
    this.sampleFrame.timestampMs = Math.round(time * 1000);
    return this.sampleFrame;
  }

  private getActiveTool(): OpenBrushToolDescriptor {
    const appStateEntity = this.getFirstEntity("appState");
    return resolveOpenBrushTool(
      appStateEntity
        ? String(appStateEntity.getValue(OpenBrushAppState, "activeTool"))
        : "free-paint",
    );
  }

  private setActivePointerSampleCount(commandEntity: Entity): void {
    const hand = String(commandEntity.getValue(InputCommandState, "primaryHand"));
    for (const entity of this.queries.pointers.entities) {
      if (String(entity.getValue(BrushPointer, "hand")) === hand) {
        entity.setValue(BrushPointer, "sampleCount", 0);
      }
    }
  }

  private setPointerSampleCount(sampleCount: number): void {
    for (const entity of this.queries.pointers.entities) {
      if (entity.getValue(BrushPointer, "isDrawing")) {
        entity.setValue(BrushPointer, "sampleCount", sampleCount);
      }
    }
  }

  private updateHistoryState(): void {
    for (const entity of this.queries.history.entities) {
      entity.setValue(StrokeHistoryState, "undoDepth", this.undoStack.length);
      entity.setValue(StrokeHistoryState, "redoDepth", this.redoStack.length);
      entity.setValue(
        StrokeHistoryState,
        "totalStrokeCount",
        this.strokeCounter,
      );
      entity.setValue(
        StrokeHistoryState,
        "activeStrokeControlPoints",
        this.activeStroke?.controlPoints.length ?? 0,
      );
    }
  }

  private getFirstEntity(
    queryName: "commands" | "appState" | "brushSettings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushPointer,
  BrushSettings,
  BrushStroke,
  InputCommandState,
  OpenBrushAppState,
  StrokeHistoryState,
} from "../components/OpenBrushCore.js";
import { generateBrushGeometry } from "../openbrush/brush-geometry.js";
import { shouldSampleControlPoint } from "../openbrush/stroke-authoring.js";
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
}) {
  private readonly samplePosition = new Vector3();
  private readonly sampleQuaternion = new Quaternion();
  private readonly cameraPosition = new Vector3();
  private readonly sampleDirection = new Vector3();
  private readonly sampleNdc = new Vector3();
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

    const paintPressed = Boolean(
      commandEntity.getValue(InputCommandState, "paintPressed"),
    );
    if (paintPressed) {
      this.samplePointerPose(commandEntity);
      const pressure = Number(commandEntity.getValue(InputCommandState, "pressure"));
      if (!this.activeStroke) {
        this.startStroke(commandEntity, time, pressure);
      } else {
        this.sampleActiveStroke(time, pressure, false);
      }
    } else if (this.activeStroke) {
      this.finalizeActiveStroke();
    }

    this.updateHistoryState();
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

    this.strokeCounter += 1;
    const guid = `runtime-stroke-${this.strokeCounter}`;
    const strokeData = createEmptyStrokeData({
      guid,
      brushGuid,
      brushSize,
      brushScale: 1,
      color,
      layerIndex,
      seed: this.strokeCounter,
      controlPoints: [],
    });
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial({
      vertexColors: true,
      side: DoubleSide,
      opacity: color[3],
      transparent: color[3] < 1,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.name = `OpenBrushStrokeMesh_${this.strokeCounter}`;

    const entity = this.world.createTransformEntity(mesh);
    entity.object3D!.name = `OpenBrushStroke_${this.strokeCounter}`;
    entity.addComponent(BrushStroke, {
      guid,
      brushGuid,
      layerIndex,
      brushSize,
      color,
      finalized: false,
      visible: true,
      controlPointCount: 0,
      vertexCount: 0,
      indexCount: 0,
      commandIndex: this.strokeCounter,
    });

    const stroke: RuntimeStroke = {
      entity,
      mesh,
      geometry,
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

  private rebuildStrokeMesh(stroke: RuntimeStroke): void {
    const generated = generateBrushGeometry(stroke.strokeData, "ribbon");
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
    stroke.entity.setValue(BrushStroke, "finalized", true);
    stroke.entity.setValue(BrushStroke, "visible", true);
    this.undoStack.push(stroke.entity);
    this.activeStroke = undefined;
  }

  private undoLastStroke(): void {
    const entity = this.undoStack.pop();
    if (!entity) {
      return;
    }
    entity.setValue(BrushStroke, "visible", false);
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

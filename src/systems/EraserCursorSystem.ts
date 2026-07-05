import {
  Mesh,
  MeshBasicMaterial,
  Transform,
  VisibilityState,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  InputCommandState,
  OpenBrushAppState,
  OpenBrushEraserCursor,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  resolveOpenBrushCommandRouting,
  type OpenBrushCommandRouting,
} from "../openbrush/command-mapper.js";
import {
  isOpenBrushEraserCursorVisible,
  writeOpenBrushEraserCursorLocalPosition,
} from "../openbrush/eraser-cursor.js";
import { normalizeOpenBrushEraserRadius } from "../openbrush/tools.js";

const COLD_COLOR = 0x7dd3fc;
const HOT_COLOR = 0xff5c7a;
const COLD_OPACITY = 0.24;
const HOT_OPACITY = 0.42;

export class EraserCursorSystem extends createSystem({
  cursors: { required: [OpenBrushEraserCursor, Transform] },
  appState: { required: [OpenBrushAppState] },
  commands: { required: [InputCommandState] },
  settings: { required: [SettingsState] },
}) {
  private readonly commandRouting: OpenBrushCommandRouting = {
    brushHand: "right",
    wandHand: "left",
  };
  private readonly localPosition: [number, number, number] = [0, 0, 0];

  update(): void {
    const appState = this.getFirstEntity("appState");
    const commandState = this.getFirstEntity("commands");
    const settings = this.getFirstEntity("settings");
    if (!appState || !commandState || !settings) {
      return;
    }

    resolveOpenBrushCommandRouting(
      String(settings.getValue(SettingsState, "dominantHand")),
      this.commandRouting,
    );

    const activeTool = String(appState.getValue(OpenBrushAppState, "activeTool"));
    const visible = isOpenBrushEraserCursorVisible(
      activeTool,
      this.getVisibilityStateId(),
    );
    const hot =
      visible && Boolean(commandState.getValue(InputCommandState, "paintPressed"));
    const parent = this.getBrushHandRayEntity();

    for (const cursor of this.queries.cursors.entities) {
      const radius = normalizeOpenBrushEraserRadius(
        Number(cursor.getValue(OpenBrushEraserCursor, "radius")),
      );
      const forwardOffset = Math.max(
        0,
        Number(cursor.getValue(OpenBrushEraserCursor, "forwardOffset")),
      );
      writeOpenBrushEraserCursorLocalPosition(this.localPosition, forwardOffset);
      this.writeCursorTransform(cursor, parent, this.localPosition, radius);
      this.writeCursorState(cursor, visible, hot);
      this.writeCursorMaterial(cursor, hot);
      if (cursor.object3D) {
        cursor.object3D.visible = visible;
      }
    }
  }

  private getVisibilityStateId(): string {
    return this.world.visibilityState.peek() === VisibilityState.NonImmersive
      ? "non-immersive"
      : "visible";
  }

  private getBrushHandRayEntity(): Entity {
    return this.commandRouting.brushHand === "left"
      ? this.world.playerSpaceEntities.raySpaces.left
      : this.world.playerSpaceEntities.raySpaces.right;
  }

  private writeCursorTransform(
    cursor: Entity,
    parent: Entity,
    position: readonly [number, number, number],
    radius: number,
  ): void {
    if (cursor.getValue(Transform, "parent") !== parent) {
      cursor.setValue(Transform, "parent", parent);
    }

    const positionView = cursor.getVectorView(Transform, "position") as Float32Array;
    positionView[0] = position[0];
    positionView[1] = position[1];
    positionView[2] = position[2];

    const scaleView = cursor.getVectorView(Transform, "scale") as Float32Array;
    scaleView[0] = radius;
    scaleView[1] = radius;
    scaleView[2] = radius;
  }

  private writeCursorState(cursor: Entity, visible: boolean, hot: boolean): void {
    const hand = this.commandRouting.brushHand;
    if (String(cursor.getValue(OpenBrushEraserCursor, "hand")) !== hand) {
      cursor.setValue(OpenBrushEraserCursor, "hand", hand);
    }
    if (Boolean(cursor.getValue(OpenBrushEraserCursor, "visible")) !== visible) {
      cursor.setValue(OpenBrushEraserCursor, "visible", visible);
    }
    if (Boolean(cursor.getValue(OpenBrushEraserCursor, "hot")) !== hot) {
      cursor.setValue(OpenBrushEraserCursor, "hot", hot);
    }
  }

  private writeCursorMaterial(cursor: Entity, hot: boolean): void {
    const object = cursor.object3D;
    if (!(object instanceof Mesh) || !(object.material instanceof MeshBasicMaterial)) {
      return;
    }

    object.material.color.setHex(hot ? HOT_COLOR : COLD_COLOR);
    object.material.opacity = hot ? HOT_OPACITY : COLD_OPACITY;
  }

  private getFirstEntity(
    queryName: "appState" | "commands" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

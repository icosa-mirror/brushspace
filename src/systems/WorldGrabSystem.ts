import {
  InputComponent,
  Quaternion,
  Transform,
  Vector3,
  VisibilityState,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  InputCommandState,
  OpenBrushScenePose,
} from "../components/OpenBrushCore.js";
import {
  applyOpenBrushTwoHandGrab,
  copyWorldGrabGrip,
  createWorldGrabGrip,
  createWorldGrabPose,
} from "../openbrush/world-grab.js";

import { AudioFeedbackSystem } from "./AudioFeedbackSystem.js";

/**
 * Port of Open Brush's two-handed world grab (SketchControlsScript
 * UpdateGrab_World): holding both grips moves, turns (about world up while
 * tilt protection is on), and uniformly scales the sketch by transforming the
 * scene pose root. One grip alone does nothing, matching the original.
 */
export class WorldGrabSystem extends createSystem({
  scenePoses: { required: [OpenBrushScenePose, Transform] },
  commands: { required: [InputCommandState] },
}) {
  private readonly previousLeft = createWorldGrabGrip();
  private readonly previousRight = createWorldGrabGrip();
  private readonly currentLeft = createWorldGrabGrip();
  private readonly currentRight = createWorldGrabGrip();
  private readonly pose = createWorldGrabPose();
  private readonly worldPosition = new Vector3();
  private readonly worldQuaternion = new Quaternion();
  private wasGrabbing = false;

  update(): void {
    const poseEntity = this.getFirstEntity("scenePoses");
    const commandEntity = this.getFirstEntity("commands");
    const object = poseEntity?.object3D;
    if (!poseEntity || !object || !commandEntity) {
      return;
    }

    const leftGamepad = this.input.xr.gamepads.left;
    const rightGamepad = this.input.xr.gamepads.right;
    const bothGripsHeld =
      Boolean(leftGamepad?.getButtonPressed(InputComponent.Squeeze)) &&
      Boolean(rightGamepad?.getButtonPressed(InputComponent.Squeeze));
    // No world transform while a stroke is being drawn (AllowWorldTransform).
    const painting = Boolean(
      commandEntity.getValue(InputCommandState, "paintPressed"),
    );
    const grabbing =
      bothGripsHeld &&
      !painting &&
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;

    if (grabbing) {
      this.readGrip(this.player.gripSpaces.left, this.currentLeft);
      this.readGrip(this.player.gripSpaces.right, this.currentRight);
      if (this.wasGrabbing) {
        this.pose.position[0] = object.position.x;
        this.pose.position[1] = object.position.y;
        this.pose.position[2] = object.position.z;
        this.pose.orientation[0] = object.quaternion.x;
        this.pose.orientation[1] = object.quaternion.y;
        this.pose.orientation[2] = object.quaternion.z;
        this.pose.orientation[3] = object.quaternion.w;
        this.pose.scale = object.scale.x;
        applyOpenBrushTwoHandGrab(
          this.pose,
          this.previousLeft,
          this.previousRight,
          this.currentLeft,
          this.currentRight,
        );
        object.position.set(
          this.pose.position[0],
          this.pose.position[1],
          this.pose.position[2],
        );
        object.quaternion.set(
          this.pose.orientation[0],
          this.pose.orientation[1],
          this.pose.orientation[2],
          this.pose.orientation[3],
        );
        object.scale.setScalar(this.pose.scale);
        if (
          Number(poseEntity.getValue(OpenBrushScenePose, "scale")) !==
          this.pose.scale
        ) {
          poseEntity.setValue(OpenBrushScenePose, "scale", this.pose.scale);
        }
      }
      copyWorldGrabGrip(this.previousLeft, this.currentLeft);
      copyWorldGrabGrip(this.previousRight, this.currentRight);
    }

    if (this.wasGrabbing !== grabbing) {
      this.wasGrabbing = grabbing;
      poseEntity.setValue(OpenBrushScenePose, "grabActive", grabbing);
      if (grabbing) {
        this.world.getSystem(AudioFeedbackSystem)?.playSound("world-grab");
      }
    }
  }

  private readGrip(
    space: { getWorldPosition(target: Vector3): Vector3; getWorldQuaternion(target: Quaternion): Quaternion },
    target: { position: [number, number, number]; orientation: [number, number, number, number] },
  ): void {
    space.getWorldPosition(this.worldPosition);
    space.getWorldQuaternion(this.worldQuaternion);
    target.position[0] = this.worldPosition.x;
    target.position[1] = this.worldPosition.y;
    target.position[2] = this.worldPosition.z;
    target.orientation[0] = this.worldQuaternion.x;
    target.orientation[1] = this.worldQuaternion.y;
    target.orientation[2] = this.worldQuaternion.z;
    target.orientation[3] = this.worldQuaternion.w;
  }

  private getFirstEntity(
    queryName: "scenePoses" | "commands",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

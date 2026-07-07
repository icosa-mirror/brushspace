import {
  InputComponent,
  Quaternion,
  Transform,
  Vector3,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import { OpenBrushTipAnchor } from "../components/OpenBrushCore.js";

/**
 * In-headset tuning for the tip anchor (the Quest browser reports bad
 * target-ray-space poses, so the draw head hangs off the grip space with a
 * tuned offset instead):
 *
 * 1. Hold the A button — the right-hand anchor freezes in the scene while
 *    you reposition the controller around it.
 * 2. Release — the anchor re-parents under the grip space, keeping its world
 *    pose, and the resulting grip-local transform is printed to the console.
 *    Bake those numbers into OPEN_BRUSH_TIP_ANCHOR_POSITION/QUATERNION.
 */
export class TipAnchorTuningSystem extends createSystem({
  tipAnchors: { required: [OpenBrushTipAnchor, Transform] },
}) {
  private readonly worldPosition = new Vector3();
  private readonly worldQuaternion = new Quaternion();
  private readonly gripPosition = new Vector3();
  private readonly gripQuaternion = new Quaternion();
  private readonly localPosition = new Vector3();
  private readonly localQuaternion = new Quaternion();
  private tuning = false;

  update(): void {
    const gamepad = this.input.xr.gamepads.right;
    if (!gamepad) {
      return;
    }
    const anchor = this.getAnchor("right");
    const object = anchor?.object3D;
    if (!anchor || !object) {
      return;
    }

    if (!this.tuning && gamepad.getButtonDown(InputComponent.A_Button)) {
      this.tuning = true;
      // Freeze in the scene, preserving the world pose.
      object.getWorldPosition(this.worldPosition);
      object.getWorldQuaternion(this.worldQuaternion);
      anchor.setValue(Transform, "parent", this.world.activeLevel.peek());
      object.position.copy(this.worldPosition);
      object.quaternion.copy(this.worldQuaternion);
      console.log("[TipAnchorTuning] anchor frozen — position the controller, then release A");
      return;
    }

    if (this.tuning && gamepad.getButtonUp(InputComponent.A_Button)) {
      this.tuning = false;
      object.getWorldPosition(this.worldPosition);
      object.getWorldQuaternion(this.worldQuaternion);

      const grip = this.player.gripSpaces.right;
      grip.getWorldPosition(this.gripPosition);
      grip.getWorldQuaternion(this.gripQuaternion);

      // Grip-local pose of the frozen anchor.
      this.localQuaternion.copy(this.gripQuaternion).invert();
      this.localPosition
        .copy(this.worldPosition)
        .sub(this.gripPosition)
        .applyQuaternion(this.localQuaternion);
      this.localQuaternion.multiply(this.worldQuaternion);

      const gripEntity = this.world.playerSpaceEntities.gripSpaces.right;
      anchor.setValue(Transform, "parent", gripEntity);
      object.position.copy(this.localPosition);
      object.quaternion.copy(this.localQuaternion);

      const p = this.localPosition;
      const q = this.localQuaternion;
      console.log(
        "[TipAnchorTuning] grip-local tip anchor:\n" +
          `  OPEN_BRUSH_TIP_ANCHOR_POSITION = [${p.x.toFixed(4)}, ${p.y.toFixed(4)}, ${p.z.toFixed(4)}]\n` +
          `  OPEN_BRUSH_TIP_ANCHOR_QUATERNION = [${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, ${q.w.toFixed(4)}]`,
      );
    }
  }

  private getAnchor(hand: "left" | "right"): Entity | undefined {
    for (const anchor of this.queries.tipAnchors.entities) {
      if (String(anchor.getValue(OpenBrushTipAnchor, "hand")) === hand) {
        return anchor;
      }
    }
    return undefined;
  }
}

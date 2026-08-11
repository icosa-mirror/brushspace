import {
  Euler,
  Quaternion,
  Transform,
  Vector3,
  VisibilityState,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  OpenBrushScenePose,
  ViewerModeState,
} from "../components/core.js";
import {
  applyViewerLookDelta,
  applyViewerStickCurve,
  clampViewerScenePosition,
  createViewerLookState,
  resolveViewerMoveSpeed,
  resolveViewerMoveVector,
  type ViewerMoveInput,
} from "../tools/viewer-navigation.js";

/**
 * Flatscreen viewer navigation — port of FlyTool's non-VR branch.
 *
 * Look rotates the browser camera; movement translates the scene pose
 * inversely (`App.Scene.Pose.translation -= cameraRotation * move * speed`),
 * which is the same root the two-hand world grab drives, so flying in the
 * browser and then entering XR leaves the sketch where the viewer put it.
 * Runs only in the non-immersive view, so it never contends with WorldGrabSystem.
 */
export class ViewerNavigationSystem extends createSystem({
  viewerMode: { required: [ViewerModeState] },
  scenePoses: { required: [OpenBrushScenePose, Transform] },
}) {
  private readonly look = createViewerLookState();
  private readonly moveInput: ViewerMoveInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    stickX: 0,
    stickY: 0,
    vertical: 0,
  };
  private readonly moveVector = new Vector3();
  private readonly scenePosition = new Vector3();
  private readonly cameraQuaternion = new Quaternion();
  private readonly cameraEuler = new Euler(0, 0, 0, "YXZ");
  private readonly scenePositionScratch: [number, number, number] = [0, 0, 0];
  private dragging = false;
  private pendingLookX = 0;
  private pendingLookY = 0;
  private invertLookLatch = false;

  init() {
    // Seed from the landing pose so the first drag continues from the
    // authored view instead of snapping to level.
    this.cameraEuler.setFromQuaternion(this.world.camera.quaternion, "YXZ");
    this.look.yaw = this.cameraEuler.y;
    this.look.pitch = this.cameraEuler.x;
    this.attachPointerLook();
  }

  update(delta: number) {
    const viewerMode = this.getViewerModeEntity();
    if (!viewerMode) {
      return;
    }
    const active =
      Boolean(viewerMode.getValue(ViewerModeState, "navEnabled")) &&
      this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    if (!active) {
      this.dragging = false;
      this.pendingLookX = 0;
      this.pendingLookY = 0;
      return;
    }

    this.applyLook(viewerMode, delta);
    this.applyMove(delta);
  }

  private applyLook(viewerMode: Entity, delta: number): void {
    const invertLook = Boolean(viewerMode.getValue(ViewerModeState, "invertLook"));
    const gamepad = this.getGamepad();
    let lookX = this.pendingLookX;
    let lookY = this.pendingLookY;
    this.pendingLookX = 0;
    this.pendingLookY = 0;

    if (gamepad) {
      // Right stick look, squared response curve, scaled by frame time so it
      // matches the drag path's units.
      lookX += applyViewerStickCurve(gamepad.axes[2] ?? 0) * delta;
      lookY -= applyViewerStickCurve(gamepad.axes[3] ?? 0) * delta;
      // R3 toggles invert look, edge-detected against the latch.
      const invertPressed = Boolean(gamepad.buttons[11]?.pressed);
      if (invertPressed && !this.invertLookLatch) {
        viewerMode.setValue(ViewerModeState, "invertLook", !invertLook);
      }
      this.invertLookLatch = invertPressed;
    }

    if (lookX === 0 && lookY === 0) {
      return;
    }
    applyViewerLookDelta(this.look, { x: lookX, y: lookY }, invertLook);
    this.cameraEuler.set(this.look.pitch, this.look.yaw, 0, "YXZ");
    this.world.camera.quaternion.setFromEuler(this.cameraEuler);
  }

  private applyMove(delta: number): void {
    this.readMoveInput();
    const move = resolveViewerMoveVector(this.moveInput);
    if (move[0] === 0 && move[1] === 0 && move[2] === 0) {
      return;
    }
    const poseEntity = this.getScenePoseEntity();
    const object = poseEntity?.object3D;
    if (!poseEntity || !object) {
      return;
    }

    const speed = resolveViewerMoveSpeed(this.isSprinting());
    this.moveVector.set(move[0], move[1], move[2]);
    // Camera-relative movement, then applied inversely to the scene: moving
    // the viewer forward slides the world backward (FlyTool's convention).
    this.world.camera.getWorldQuaternion(this.cameraQuaternion);
    this.moveVector.applyQuaternion(this.cameraQuaternion);
    this.moveVector.multiplyScalar(speed * delta);

    this.scenePosition.copy(object.position).sub(this.moveVector);
    this.scenePositionScratch[0] = this.scenePosition.x;
    this.scenePositionScratch[1] = this.scenePosition.y;
    this.scenePositionScratch[2] = this.scenePosition.z;
    clampViewerScenePosition(this.scenePositionScratch);
    object.position.set(
      this.scenePositionScratch[0],
      this.scenePositionScratch[1],
      this.scenePositionScratch[2],
    );
  }

  private readMoveInput(): void {
    const keyboard = this.world.input.keyboard;
    this.moveInput.forward = keyboard.getKeyPressed("KeyW");
    this.moveInput.backward = keyboard.getKeyPressed("KeyS");
    this.moveInput.left = keyboard.getKeyPressed("KeyA");
    this.moveInput.right = keyboard.getKeyPressed("KeyD");
    this.moveInput.up = keyboard.getKeyPressed("KeyE");
    this.moveInput.down = keyboard.getKeyPressed("KeyQ");

    const gamepad = this.getGamepad();
    this.moveInput.stickX = gamepad ? (gamepad.axes[0] ?? 0) : 0;
    this.moveInput.stickY = gamepad ? -(gamepad.axes[1] ?? 0) : 0;
    this.moveInput.vertical = gamepad
      ? (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0)
      : 0;
  }

  private isSprinting(): boolean {
    const keyboard = this.world.input.keyboard;
    if (
      keyboard.getKeyPressed("ShiftLeft") ||
      keyboard.getKeyPressed("ShiftRight")
    ) {
      return true;
    }
    // L3, as FlyTool reads leftStickButton for sprint.
    return Boolean(this.getGamepad()?.buttons[10]?.pressed);
  }

  private getGamepad(): Gamepad | undefined {
    const gamepads = (
      this.world.input as { browserGamepads?: { gamepads?: Gamepad[] } }
    ).browserGamepads?.gamepads;
    return gamepads?.find((gamepad) => gamepad?.connected) ?? undefined;
  }

  /**
   * Drag-to-look on the canvas. Covers mouse and single-finger touch with one
   * path, deltas normalized by viewport size like FlyTool's touch branch.
   */
  private attachPointerLook(): void {
    const canvas = this.world.renderer.domElement;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || !this.isNavigationActive()) {
        return;
      }
      this.dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {}
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!this.dragging || !event.isPrimary) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      this.pendingLookX += (event.clientX - lastX) / Math.max(1, rect.width);
      this.pendingLookY += (event.clientY - lastY) / Math.max(1, rect.height);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }
      this.dragging = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {}
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    this.cleanupFuncs.push(() => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    });
  }

  private isNavigationActive(): boolean {
    const viewerMode = this.getViewerModeEntity();
    return (
      Boolean(viewerMode?.getValue(ViewerModeState, "navEnabled")) &&
      this.world.visibilityState.peek() === VisibilityState.NonImmersive
    );
  }

  private getViewerModeEntity(): Entity | undefined {
    const next = this.queries.viewerMode.entities.values().next();
    return next.done ? undefined : next.value;
  }

  private getScenePoseEntity(): Entity | undefined {
    const next = this.queries.scenePoses.entities.values().next();
    return next.done ? undefined : next.value;
  }
}

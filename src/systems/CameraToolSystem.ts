import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  VisibilityState,
  WebGLRenderTarget,
  createSystem,
} from "@iwsdk/core";
import type { Entity, Object3D } from "@iwsdk/core";

import {
  InputCommandState,
  OpenBrushAppState,
  OpenBrushCameraState,
  OpenBrushTipAnchor,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  resolveOpenBrushCommandRouting,
  type OpenBrushCommandRouting,
} from "../openbrush/command-mapper.js";

// MultiCam snapshot settings from the reference: CameraConfig.kFovDefault 80,
// ScreenshotManager default width 1920 with 16:9 aspect.
import { AudioFeedbackSystem } from "./AudioFeedbackSystem.js";

const SNAPSHOT_FOV_DEGREES = 80;
const SNAPSHOT_WIDTH = 1920;
const SNAPSHOT_HEIGHT = 1080;
const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 270;
// Viewfinder model dimensions (meters), sized like the MultiCam rig.
const SCREEN_WIDTH = 0.096;
const SCREEN_HEIGHT = 0.054;
const BODY_DEPTH = 0.022;
const FLASH_DURATION_SECONDS = 0.18;
const CAMERA_FORWARD_OFFSET = 0.06;

/**
 * Port of Open Brush's MultiCam snapshot mode: a viewfinder camera rides the
 * brush controller showing a live preview; the trigger captures a 1920x1080
 * snapshot (downloaded as a PNG) with a flash on the viewfinder.
 */
export class CameraToolSystem extends createSystem({
  appState: { required: [OpenBrushAppState, OpenBrushCameraState] },
  commands: { required: [InputCommandState] },
  settings: { required: [SettingsState] },
  tipAnchors: { required: [OpenBrushTipAnchor] },
}) {
  private readonly commandRouting: OpenBrushCommandRouting = {
    brushHand: "right",
    wandHand: "left",
  };
  private rig!: Group;
  private snapshotCamera!: PerspectiveCamera;
  private previewTarget!: WebGLRenderTarget;
  private captureTarget!: WebGLRenderTarget;
  private flashQuad!: Mesh;
  private flashTimer = 0;
  private capturePixels!: Uint8Array;
  private captureCanvas?: HTMLCanvasElement;

  init() {
    this.previewTarget = new WebGLRenderTarget(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    this.captureTarget = new WebGLRenderTarget(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);
    this.capturePixels = new Uint8Array(SNAPSHOT_WIDTH * SNAPSHOT_HEIGHT * 4);

    this.rig = new Group();
    this.rig.name = "OpenBrushCameraRig";
    this.rig.visible = false;

    const body = new Mesh(
      new BoxGeometry(SCREEN_WIDTH + 0.012, SCREEN_HEIGHT + 0.012, BODY_DEPTH),
      new MeshBasicMaterial({ color: 0x18181b }),
    );
    body.raycast = () => {};
    this.rig.add(body);

    const lens = new Mesh(
      new RingGeometry(0.008, 0.014, 32),
      new MeshBasicMaterial({ color: 0xffffff }),
    );
    lens.position.z = -(BODY_DEPTH / 2 + 0.001);
    lens.rotation.y = Math.PI;
    lens.raycast = () => {};
    this.rig.add(lens);

    // Live viewfinder on the user-facing side.
    const screen = new Mesh(
      new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
      new MeshBasicMaterial({ map: this.previewTarget.texture }),
    );
    screen.position.z = BODY_DEPTH / 2 + 0.001;
    screen.raycast = () => {};
    this.rig.add(screen);

    this.flashQuad = new Mesh(
      new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    );
    this.flashQuad.position.z = BODY_DEPTH / 2 + 0.002;
    this.flashQuad.visible = false;
    this.flashQuad.raycast = () => {};
    this.rig.add(this.flashQuad);

    this.snapshotCamera = new PerspectiveCamera(
      SNAPSHOT_FOV_DEGREES,
      SNAPSHOT_WIDTH / SNAPSHOT_HEIGHT,
      0.05,
      200,
    );
    this.rig.add(this.snapshotCamera);

    // In front of the tip anchor, screen tilted back toward the viewer.
    this.rig.position.set(0, 0.02, -(CAMERA_FORWARD_OFFSET - 0.045));
    this.rig.rotation.x = -0.35;

    this.cleanupFuncs.push(() => {
      this.previewTarget.dispose();
      this.captureTarget.dispose();
    });
  }

  update(delta: number) {
    const appState = this.getFirstEntity("appState");
    const commandState = this.getFirstEntity("commands");
    const settings = this.getFirstEntity("settings");
    if (!appState || !commandState || !settings) {
      return;
    }

    const active =
      String(appState.getValue(OpenBrushAppState, "activeTool")) === "camera" &&
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!active) {
      if (this.rig.visible) {
        this.rig.visible = false;
      }
      return;
    }

    resolveOpenBrushCommandRouting(
      String(settings.getValue(SettingsState, "dominantHand")),
      this.commandRouting,
    );
    const parentObject = this.getBrushHandRayObject();
    if (parentObject && this.rig.parent !== parentObject) {
      parentObject.add(this.rig);
    }
    // While the UI ray is on a panel, the trigger belongs to the UI: hide
    // the viewfinder and hold the shutter.
    const pointerOnUi = Boolean(
      commandState.getValue(InputCommandState, "pointerOnUi"),
    );
    this.rig.visible = !pointerOnUi;

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - delta);
      this.flashQuad.visible = this.flashTimer > 0;
    }
    if (pointerOnUi) {
      return;
    }

    if (Boolean(commandState.getValue(InputCommandState, "paintDown"))) {
      this.captureSnapshot(appState);
    }

    this.renderTo(this.previewTarget);
  }

  private getBrushHandRayObject(): Object3D | null {
    for (const anchor of this.queries.tipAnchors.entities) {
      if (
        String(anchor.getValue(OpenBrushTipAnchor, "hand")) ===
        this.commandRouting.brushHand
      ) {
        return anchor.object3D ?? null;
      }
    }
    return null;
  }

  /** Renders the scene from the rig camera without disturbing XR output. */
  private renderTo(target: WebGLRenderTarget): void {
    const renderer = this.world.renderer;
    const xrWasEnabled = renderer.xr.enabled;
    const previousTarget = renderer.getRenderTarget();
    renderer.xr.enabled = false;
    this.rig.visible = false;
    renderer.setRenderTarget(target);
    renderer.render(this.world.scene, this.snapshotCamera);
    renderer.setRenderTarget(previousTarget);
    renderer.xr.enabled = xrWasEnabled;
    this.rig.visible = true;
  }

  private captureSnapshot(appState: Entity): void {
    this.world.getSystem(AudioFeedbackSystem)?.playSound("camera-shutter");
    this.renderTo(this.captureTarget);
    this.world.renderer.readRenderTargetPixels(
      this.captureTarget,
      0,
      0,
      SNAPSHOT_WIDTH,
      SNAPSHOT_HEIGHT,
      this.capturePixels,
    );

    const canvas = this.getCaptureCanvas();
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    const image = context.createImageData(SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);
    // GL reads bottom-up; flip rows for the canvas.
    for (let row = 0; row < SNAPSHOT_HEIGHT; row += 1) {
      const source = (SNAPSHOT_HEIGHT - 1 - row) * SNAPSHOT_WIDTH * 4;
      image.data.set(
        this.capturePixels.subarray(source, source + SNAPSHOT_WIDTH * 4),
        row * SNAPSHOT_WIDTH * 4,
      );
    }
    context.putImageData(image, 0, 0);

    const count = Number(appState.getValue(OpenBrushCameraState, "snapshotCount")) + 1;
    const name = `openbrush-snapshot-${String(count).padStart(3, "0")}.png`;
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document?.createElement("a");
      if (anchor) {
        anchor.href = url;
        anchor.download = name;
        anchor.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");

    appState.setValue(OpenBrushCameraState, "snapshotCount", count);
    appState.setValue(OpenBrushCameraState, "lastSnapshotName", name);
    appState.setValue(OpenBrushAppState, "toolStatus", `snapshot saved (${name})`);
    this.flashTimer = FLASH_DURATION_SECONDS;
    this.flashQuad.visible = true;
  }

  private getCaptureCanvas(): HTMLCanvasElement | undefined {
    if (!this.captureCanvas) {
      const canvas = globalThis.document?.createElement("canvas");
      if (!canvas) {
        return undefined;
      }
      canvas.width = SNAPSHOT_WIDTH;
      canvas.height = SNAPSHOT_HEIGHT;
      this.captureCanvas = canvas;
    }
    return this.captureCanvas;
  }

  private getFirstEntity(
    queryName: "appState" | "commands" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

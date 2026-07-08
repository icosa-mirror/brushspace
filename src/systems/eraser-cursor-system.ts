import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Transform,
  VisibilityState,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { LineSegments2 } from "three/addons/lines/LineSegments2.js";

import {
  InputCommandState,
  OpenBrushAppState,
  OpenBrushEraserCursor,
  OpenBrushTipAnchor,
  SettingsState,
} from "../components/core.js";
import {
  resolveOpenBrushCommandRouting,
  type OpenBrushCommandRouting,
} from "../tools/command-mapper.js";
import {
  createOpenBrushEraserSpinState,
  resolveOpenBrushToolSphereCursor,
  stepOpenBrushEraserSpin,
  type OpenBrushToolSphereCursor,
} from "../tools/eraser-cursor.js";
import { normalizeOpenBrushEraserRadius } from "../tools/tools.js";

const COLD_COLOR = 0xffffff;
const HOT_COLOR = 0xff4d5e;
// DropperTool description flag: unfurls at m_EnterSpeed while a stroke is
// hovered, showing the brush that would be picked.
const LABEL_ENTER_SPEED = 16;
const LABEL_WIDTH = 0.1;
const LABEL_HEIGHT = 0.032;

/**
 * Drives the tool sphere cursor: the wireframe globe that replaces the
 * drawing tip for the eraser and the pick tools. Mirrors Open Brush's
 * EraserTool visuals — the sphere sits on the drawing tip, spins up while
 * the trigger is held, and swaps to the hot material.
 */
export class EraserCursorSystem extends createSystem({
  cursors: { required: [OpenBrushEraserCursor, Transform] },
  tipAnchors: { required: [OpenBrushTipAnchor, Transform] },
  appState: { required: [OpenBrushAppState] },
  commands: { required: [InputCommandState] },
  settings: { required: [SettingsState] },
}) {
  private readonly commandRouting: OpenBrushCommandRouting = {
    brushHand: "right",
    wandHand: "left",
  };
  private readonly sphereCursor: OpenBrushToolSphereCursor = {
    visible: false,
    radius: 0,
    forwardOffset: 0,
    spins: false,
  };
  private readonly spin = createOpenBrushEraserSpinState();
  private appliedColorHex = -1;
  private readonly hoverTint = new Color();
  private label?: Group;
  private labelContext?: CanvasRenderingContext2D;
  private labelTexture?: CanvasTexture;
  private labelEnterAmount = 0;
  private appliedLabelText = "";

  update(delta: number): void {
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
    const parent = this.getBrushHandAnchorEntity();
    if (!parent) {
      return;
    }

    // While the UI ray is on a panel, the trigger belongs to the UI — hide
    // the tool sphere so it does not read as an armed eraser/picker.
    const pointerOnUi = Boolean(
      commandState.getValue(InputCommandState, "pointerOnUi"),
    );
    for (const cursor of this.queries.cursors.entities) {
      const eraserRadius = normalizeOpenBrushEraserRadius(
        Number(cursor.getValue(OpenBrushEraserCursor, "radius")),
      );
      const sphere = resolveOpenBrushToolSphereCursor(
        activeTool,
        this.getVisibilityStateId(),
        eraserRadius,
        this.sphereCursor,
      );
      if (pointerOnUi) {
        sphere.visible = false;
      }
      const hot =
        sphere.visible &&
        Boolean(commandState.getValue(InputCommandState, "paintPressed"));

      stepOpenBrushEraserSpin(this.spin, hot && sphere.spins, delta);

      const hoverValid =
        sphere.visible &&
        !sphere.spins &&
        Boolean(cursor.getValue(OpenBrushEraserCursor, "hoverValid"));
      this.writeCursorTransform(cursor, parent, sphere);
      this.writeCursorState(cursor, sphere.visible, hot);
      this.writeCursorMaterial(cursor, hot, hoverValid);
      this.updateHoverLabel(cursor, parent, hoverValid, delta);
      if (cursor.object3D) {
        cursor.object3D.visible = sphere.visible;
      }
    }
  }

  private getVisibilityStateId(): string {
    return this.world.visibilityState.peek() === VisibilityState.NonImmersive
      ? "non-immersive"
      : "visible";
  }

  private getBrushHandAnchorEntity(): Entity | undefined {
    for (const anchor of this.queries.tipAnchors.entities) {
      if (
        String(anchor.getValue(OpenBrushTipAnchor, "hand")) ===
        this.commandRouting.brushHand
      ) {
        return anchor;
      }
    }
    return undefined;
  }

  private writeCursorTransform(
    cursor: Entity,
    parent: Entity,
    sphere: OpenBrushToolSphereCursor,
  ): void {
    if (cursor.getValue(Transform, "parent") !== parent) {
      cursor.setValue(Transform, "parent", parent);
    }

    // The anchor is the drawing tip; only the tool's own offset remains.
    const positionView = cursor.getVectorView(Transform, "position") as Float32Array;
    positionView[0] = 0;
    positionView[1] = 0;
    positionView[2] = -sphere.forwardOffset;

    // EraserTool spins the sphere around the controller forward axis.
    const orientationView = cursor.getVectorView(
      Transform,
      "orientation",
    ) as Float32Array;
    const halfAngle = this.spin.angle * 0.5;
    orientationView[0] = 0;
    orientationView[1] = 0;
    orientationView[2] = Math.sin(halfAngle);
    orientationView[3] = Math.cos(halfAngle);

    const scaleView = cursor.getVectorView(Transform, "scale") as Float32Array;
    scaleView[0] = sphere.radius;
    scaleView[1] = sphere.radius;
    scaleView[2] = sphere.radius;
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

  private writeCursorMaterial(
    cursor: Entity,
    hot: boolean,
    hoverValid: boolean,
  ): void {
    let hex: number;
    if (hoverValid) {
      // DropperTool tints the tool with the hovered stroke's color.
      const hoverColor = cursor.getVectorView(
        OpenBrushEraserCursor,
        "hoverColor",
      ) as Float32Array;
      hex = this.hoverTint
        .setRGB(hoverColor[0], hoverColor[1], hoverColor[2])
        .getHex();
    } else {
      hex = hot ? HOT_COLOR : COLD_COLOR;
    }
    if (hex === this.appliedColorHex) {
      return;
    }
    const object = cursor.object3D as unknown as LineSegments2 | null;
    const material = object?.material as LineMaterial | undefined;
    if (!material?.isLineMaterial) {
      return;
    }
    this.appliedColorHex = hex;
    material.color.setHex(hex);
  }

  /** DropperTool's controller-anchored brush description flag. */
  private updateHoverLabel(
    cursor: Entity,
    parent: Entity,
    hoverValid: boolean,
    delta: number,
  ): void {
    const label = this.getOrCreateLabel();
    if (!label || !this.labelContext || !this.labelTexture) {
      return;
    }
    if (parent.object3D && label.parent !== parent.object3D) {
      parent.object3D.add(label);
    }

    this.labelEnterAmount = Math.min(
      1,
      Math.max(
        0,
        this.labelEnterAmount + (hoverValid ? 1 : -1) * LABEL_ENTER_SPEED * delta,
      ),
    );
    label.visible = this.labelEnterAmount > 0;
    label.scale.x = Math.max(this.labelEnterAmount, 1e-3);

    if (!hoverValid) {
      return;
    }
    const text = String(cursor.getValue(OpenBrushEraserCursor, "hoverBrushName"));
    if (text === this.appliedLabelText) {
      return;
    }
    this.appliedLabelText = text;
    const canvas = this.labelContext.canvas;
    this.labelContext.clearRect(0, 0, canvas.width, canvas.height);
    this.labelContext.fillStyle = "rgba(9, 9, 11, 0.85)";
    this.labelContext.fillRect(0, 0, canvas.width, canvas.height);
    this.labelContext.fillStyle = "#ffffff";
    this.labelContext.font = "600 60px system-ui, sans-serif";
    this.labelContext.textAlign = "center";
    this.labelContext.textBaseline = "middle";
    this.labelContext.fillText(text, canvas.width / 2, canvas.height / 2);
    this.labelTexture.needsUpdate = true;
  }

  private getOrCreateLabel(): Group | undefined {
    if (this.label) {
      return this.label;
    }
    const canvas = globalThis.document?.createElement("canvas");
    if (!canvas) {
      return undefined;
    }
    canvas.width = 512;
    canvas.height = 164;
    this.labelContext = canvas.getContext("2d") ?? undefined;
    if (!this.labelContext) {
      return undefined;
    }
    this.labelTexture = new CanvasTexture(canvas);
    this.labelTexture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(LABEL_WIDTH, LABEL_HEIGHT),
      new MeshBasicMaterial({
        map: this.labelTexture,
        transparent: true,
        depthTest: false,
      }),
    );
    mesh.renderOrder = 40;
    mesh.raycast = () => {};
    this.label = new Group();
    this.label.name = "OpenBrushDropperLabel";
    // Above the controller, tilted back toward the viewer (anchor-relative).
    this.label.position.set(0, 0.055, 0.065);
    this.label.rotation.x = -0.5;
    this.label.visible = false;
    this.label.add(mesh);
    return this.label;
  }

  private getFirstEntity(
    queryName: "appState" | "commands" | "settings" | "tipAnchors",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

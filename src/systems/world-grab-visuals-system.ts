import {
  AssetManager,
  BoxGeometry,
  ClampToEdgeWrapping,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
  Vector3,
  createSystem,
} from "@iwsdk/core";

import type { Entity } from "@iwsdk/core";

import { OpenBrushScenePose } from "../components/core.js";
import { assetUrl } from "../app/asset-url.js";

// ControllerGrabVisuals serialized settings (XRRig prefab), retuned where the
// original values assume Tilt Brush's controller attach points.
const LINE_BASE_WIDTH = 0.0035;
const LINE_END_GAP = 0.06;
const DRAW_IN_DURATION = 0.3;
const LINE_COLOR = 0x86e6f0;
// Animal ruler: log10 of the scene scale pans a window over the silhouette
// strip (squirrel .. dinosaur). U-space constants from the reference rig.
const RULER_U_ZERO_POINT = 0.495605;
const RULER_U_EXTENT = 0.427734;
// The reference ruler is a SQUARE quad showing roughly a quarter of the
// 2048x512 strip (quadWidthU = width x 0.25 on a square base mesh): about one
// animal at a time, scrolling with log10(scale) so different silhouettes
// come into view as you resize the world.
const RULER_WINDOW_U = 0.24;
const RULER_SIZE = 0.22;
const RULER_MIN_SPAN = 0.28;
const RULER_LIFT = 0.045;

/**
 * The between-hands feedback for the two-hand world grab: a thin line
 * connecting the grips plus Open Brush's animal ruler, whose silhouette strip
 * pans with log10(scene scale) to show how big you currently are.
 */
export class WorldGrabVisualsSystem extends createSystem({
  scenePoses: { required: [OpenBrushScenePose] },
}) {
  private root!: Group;
  private line!: Mesh;
  private ruler!: Mesh;
  private rulerTexture?: Texture;
  private lineTimer = 0;
  private readonly leftPosition = new Vector3();
  private readonly rightPosition = new Vector3();
  private readonly span = new Vector3();
  private readonly midpoint = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly headUp = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly rulerNormal = new Vector3();
  private readonly rulerUp = new Vector3();
  private readonly basisRight = new Vector3();
  private readonly lineQuaternion = new Quaternion();
  private readonly toViewer = new Vector3();
  private readonly Y_AXIS = new Vector3(0, 1, 0);

  init() {
    this.root = new Group();
    this.root.name = "OpenBrushWorldGrabVisuals";
    this.root.visible = false;
    this.world.scene.add(this.root);

    this.line = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({
        color: LINE_COLOR,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.line.raycast = () => {};
    this.root.add(this.line);

    this.ruler = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
      }),
    );
    this.ruler.raycast = () => {};
    this.ruler.visible = false;
    this.root.add(this.ruler);

    void AssetManager.loadTexture(assetUrl("/openbrush/animalruler.png")).then(
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        this.rulerTexture = texture;
        const material = this.ruler.material as MeshBasicMaterial;
        material.map = texture;
        material.needsUpdate = true;
      },
    );

    this.cleanupFuncs.push(() => {
      this.root.removeFromParent();
    });
  }

  update(delta: number) {
    const next = this.queries.scenePoses.entities.values().next();
    const poseEntity = next.done ? undefined : next.value;
    const grabbing = Boolean(
      poseEntity?.getValue(OpenBrushScenePose, "grabActive"),
    );
    if (!grabbing) {
      this.lineTimer = 0;
      if (this.root.visible) {
        this.root.visible = false;
      }
      return;
    }
    this.root.visible = true;
    this.lineTimer = Math.min(this.lineTimer + delta, DRAW_IN_DURATION);
    const t = this.lineTimer / DRAW_IN_DURATION;
    const drawIn = t * t * (3 - 2 * t);

    this.player.gripSpaces.left.getWorldPosition(this.leftPosition);
    this.player.gripSpaces.right.getWorldPosition(this.rightPosition);
    this.span.copy(this.rightPosition).sub(this.leftPosition);
    const spanLength = this.span.length();
    this.midpoint
      .copy(this.leftPosition)
      .add(this.rightPosition)
      .multiplyScalar(0.5);

    // Line between the grips, drawn in from the midpoint.
    const lineLength = Math.max(0, spanLength - LINE_END_GAP * 2) * drawIn;
    if (lineLength > 0.01 && spanLength > 1e-4) {
      this.line.visible = true;
      this.line.position.copy(this.midpoint);
      this.lineQuaternion.setFromUnitVectors(
        this.Y_AXIS,
        this.basisRight.copy(this.span).divideScalar(spanLength),
      );
      this.line.quaternion.copy(this.lineQuaternion);
      this.line.scale.set(LINE_BASE_WIDTH, lineLength, LINE_BASE_WIDTH);
    } else {
      this.line.visible = false;
    }

    this.updateRuler(spanLength, this.readScale(poseEntity));
  }

  private readScale(poseEntity: Entity | undefined): number {
    if (!poseEntity) {
      return 1;
    }
    const scale = Number(poseEntity.getValue(OpenBrushScenePose, "scale"));
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  private updateRuler(spanLength: number, sceneScale: number): void {
    if (!this.rulerTexture || spanLength < RULER_MIN_SPAN) {
      this.ruler.visible = false;
      return;
    }
    this.ruler.visible = true;

    const width = RULER_SIZE;

    // Basis: width axis along the hands, normal toward the head.
    this.player.head.getWorldPosition(this.headPosition);
    this.player.head.getWorldQuaternion(this.headQuaternion);
    this.headUp.set(0, 1, 0).applyQuaternion(this.headQuaternion);
    this.basisRight.copy(this.span).normalize();
    this.rulerNormal.copy(this.basisRight).cross(this.headUp).normalize();
    // Point the normal at the viewer.
    this.toViewer.copy(this.headPosition).sub(this.midpoint);
    if (this.rulerNormal.dot(this.toViewer) < 0) {
      this.rulerNormal.negate();
    }
    this.rulerUp.copy(this.rulerNormal).cross(this.basisRight).normalize();
    this.ruler.matrix.makeBasis(this.basisRight, this.rulerUp, this.rulerNormal);
    this.ruler.quaternion.setFromRotationMatrix(this.ruler.matrix);
    this.ruler.position
      .copy(this.midpoint)
      .addScaledVector(this.rulerUp, RULER_LIFT + RULER_SIZE / 2);
    // Square quad: the ~quarter-strip window (0.24 x 2048 : 512 px) is close
    // to square, so the silhouettes render unsquished.
    this.ruler.scale.set(width, RULER_SIZE, 1);

    // Pan the strip: scene scale 1/(user size), hence the negative log.
    const texture = this.rulerTexture;
    const logUserSize = -Math.log10(Math.max(sceneScale, 1e-4));
    texture.repeat.set(RULER_WINDOW_U, 1);
    texture.offset.set(
      Math.min(
        1 - RULER_WINDOW_U,
        Math.max(
          0,
          RULER_U_ZERO_POINT + logUserSize * RULER_U_EXTENT - RULER_WINDOW_U / 2,
        ),
      ),
      0,
    );
  }
}

import {
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  createSystem,
} from "@iwsdk/core";

const TARGET_RAY_DEBUG_DIAMETER_METERS = 0.005;
const TARGET_RAY_DEBUG_RADIUS_METERS = TARGET_RAY_DEBUG_DIAMETER_METERS * 0.5;

// TEMPORARY DIAGNOSTIC: this intentionally bypasses IWSDK input mirroring and
// ECS transforms. It renders WebXR targetRaySpace directly from XRFrame.getPose.
export class TargetRaySpaceWebXRDebugSystem extends createSystem({}) {
  private sphere!: Mesh;
  private matrix = new Matrix4();
  private scale = new Vector3();

  init() {
    this.sphere = new Mesh(
      new SphereGeometry(TARGET_RAY_DEBUG_RADIUS_METERS, 16, 8),
      new MeshBasicMaterial({
        color: 0xff2bd6,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sphere.name = "WebXRRawRightTargetRaySpaceDebugSphere";
    this.sphere.frustumCulled = false;
    this.sphere.renderOrder = 10000;
    this.sphere.visible = false;
    this.world.scene.add(this.sphere);

    this.cleanupFuncs.push(() => {
      this.sphere.removeFromParent();
      this.sphere.geometry.dispose();
      const material = this.sphere.material;
      if (Array.isArray(material)) {
        for (const item of material) {
          item.dispose();
        }
      } else {
        material.dispose();
      }
    });
  }

  update() {
    const frame = this.world.renderer.xr.getFrame();
    const referenceSpace = this.world.renderer.xr.getReferenceSpace();
    const session = this.world.renderer.xr.getSession() ?? this.world.session;
    if (!frame || !referenceSpace || !session) {
      this.sphere.visible = false;
      return;
    }

    const rightTargetRaySpace = this.getRightTargetRaySpace(session);
    if (!rightTargetRaySpace) {
      this.sphere.visible = false;
      return;
    }

    const pose = frame.getPose(rightTargetRaySpace, referenceSpace);
    if (!pose) {
      this.sphere.visible = false;
      return;
    }

    this.matrix.fromArray(pose.transform.matrix);
    this.matrix.decompose(
      this.sphere.position,
      this.sphere.quaternion,
      this.scale,
    );
    this.sphere.visible = true;
  }

  private getRightTargetRaySpace(session: XRSession): XRSpace | undefined {
    for (const inputSource of session.inputSources) {
      if (inputSource.handedness === "right") {
        return inputSource.targetRaySpace;
      }
    }
    return undefined;
  }
}

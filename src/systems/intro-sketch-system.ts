import {
  AssetManager,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  createSystem,
} from "@iwsdk/core";

import type { Entity } from "@iwsdk/core";

import { OpenBrushScenePose } from "../components/core.js";
import {
  buildBakedSketchGeometry,
  resolveBakedSketchMaterial,
  type BakedSketchManifest,
} from "../sketch/baked-sketch.js";
import { assetUrl } from "../app/asset-url.js";

// The intro geometry is authored in Tilt Brush units (decimeters), arranged
// AROUND the viewer at the origin — present it in place, just rescaled.
const INTRO_SCALE = 0.1;

// Brushspace wordmark: floats above the sketch's "Powered by Tilt Brush"
// signage. Local units are decimeters (parented under the intro root).
const WORDMARK_URL = assetUrl("/openbrush/intro/brushspace.png");
const WORDMARK_WIDTH_DM = 50;
// 2081x467 px source.
const WORDMARK_HEIGHT_DM = (WORDMARK_WIDTH_DM * 467) / 2081;
const WORDMARK_POSITION_DM: readonly [number, number, number] = [0, 16, -40];

/**
 * Open Brush's welcome-screen sketch (openbrush_intro_simple.prefab),
 * extracted to a compact binary and rendered with the real brush shaders.
 * The SketchLibrarySystem controls when it shows: on the landing scene and
 * as the "Welcome Sketch" gallery entry; hidden once another sketch starts.
 */
export class IntroSketchSystem extends createSystem({
  scenePoses: { required: [OpenBrushScenePose] },
}) {
  private root?: Group;
  private rootEntity?: Entity;
  private loaded = false;
  private removed = false;
  private desiredVisible = true;
  private transitionElapsed = 0;
  private transitionDuration = 0;

  init() {
    void this.loadIntro();
  }

  /**
   * Show or hide the welcome sketch (raycast-inert either way). Meshes
   * stagger in/out like stroke transitions unless `animate` is false.
   */
  setSketchVisible(visible: boolean, animate = true): void {
    if (visible === this.desiredVisible) {
      return;
    }
    this.desiredVisible = visible;
    if (!this.root) {
      return;
    }
    this.root.visible = true;
    if (!animate) {
      this.applyChildVisibility(visible ? 1 : 0);
      this.root.visible = visible;
      this.transitionDuration = 0;
      return;
    }
    this.transitionElapsed = 0;
    this.transitionDuration = visible ? 0.9 : 0.5;
  }

  get sketchVisible(): boolean {
    return this.desiredVisible;
  }

  update(delta: number): void {
    if (this.transitionDuration <= 0 || !this.root) {
      return;
    }
    this.transitionElapsed += delta;
    const progress = Math.min(
      this.transitionElapsed / this.transitionDuration,
      1,
    );
    this.applyChildVisibility(this.desiredVisible ? progress : 1 - progress);
    if (progress >= 1) {
      this.transitionDuration = 0;
      this.root.visible = this.desiredVisible;
    }
  }

  /** Show the first `fraction` of meshes (hide happens back-to-front). */
  private applyChildVisibility(fraction: number): void {
    const children = this.root?.children ?? [];
    const visibleCount = Math.round(children.length * fraction);
    for (let index = 0; index < children.length; index += 1) {
      children[index].visible = index < visibleCount;
    }
  }

  private async loadIntro(): Promise<void> {
    try {
      const [manifestResponse, binResponse] = await Promise.all([
        fetch(assetUrl("/openbrush/intro/intro.json")),
        fetch(assetUrl("/openbrush/intro/intro.bin")),
      ]);
      if (!manifestResponse.ok || !binResponse.ok) {
        throw new Error("intro sketch assets missing");
      }
      const manifest = (await manifestResponse.json()) as BakedSketchManifest;
      const bin = await binResponse.arrayBuffer();
      if (this.removed) {
        return;
      }

      const root = new Group();
      root.name = "OpenBrushIntroSketch";

      for (const node of manifest.nodes) {
        const geometry = buildBakedSketchGeometry(node, bin);
        const material = await resolveBakedSketchMaterial(node);
        const mesh = new Mesh(geometry, material);
        mesh.name = `OpenBrushIntro_${node.materialName}`;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        root.add(mesh);
      }
      if (this.removed) {
        return;
      }
      root.add(await this.createWordmark());

      root.scale.setScalar(INTRO_SCALE);
      root.visible = this.desiredVisible;
      this.root = root;
      // Under the scene pose, like strokes and the environment, so two-hand
      // world grabs move and scale the welcome sketch too.
      const poseNext = this.queries.scenePoses.entities.values().next();
      const poseEntity = poseNext.done ? undefined : poseNext.value;
      this.rootEntity = poseEntity
        ? this.world.createTransformEntity(root, poseEntity)
        : this.world.createTransformEntity(root);
      this.rootEntity.object3D!.name = "OpenBrushIntroSketchEntity";
      this.loaded = true;
    } catch (error) {
      console.warn("Intro sketch failed to load:", error);
      this.loaded = true;
    }
  }

  /** The Brushspace wordmark, headlining the Tilt Brush signage. */
  private async createWordmark(): Promise<Mesh> {
    const texture = await AssetManager.loadTexture(WORDMARK_URL);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(WORDMARK_WIDTH_DM, WORDMARK_HEIGHT_DM),
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.name = "OpenBrushIntro_BrushspaceWordmark";
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.position.set(...WORDMARK_POSITION_DM);
    return mesh;
  }

  private removeIntro(): void {
    this.removed = true;
    if (this.root) {
      this.root.removeFromParent();
      for (const child of this.root.children) {
        (child as Mesh).geometry.dispose();
      }
      this.root = undefined;
    }
    this.rootEntity?.destroy();
    this.rootEntity = undefined;
  }
}

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  createSystem,
} from "@iwsdk/core";

import { openBrushInventory } from "../openbrush/brush-catalog.js";
import { findBrushByGuid } from "../openbrush/brush-inventory.js";
import {
  applyBrushShaderAttributeAliases,
  openBrushShaderLibrary,
} from "../openbrush/brush-shader-library.js";
import { assetUrl } from "../openbrush/asset-url.js";

interface IntroNode {
  brushGuid: string;
  materialName: string;
  vertexCount: number;
  indexCount: number;
  positionsOffset: number;
  normalsOffset: number;
  colorsOffset: number;
  uv0Offset: number;
  uv0Dimension: number;
  uv1Offset: number;
  uv1Dimension: number;
  indicesOffset: number;
}

// The intro geometry is authored in Tilt Brush units (decimeters), arranged
// AROUND the viewer at the origin — present it in place, just rescaled.
const INTRO_SCALE = 0.1;

// Brushspace wordmark: floats above the sketch's "Powered by Tilt Brush"
// signage. Local units are decimeters (parented under the intro root).
const WORDMARK_URL = assetUrl("/openbrush/intro/brushspace.png");
const WORDMARK_WIDTH_DM = 50;
// 968x118 px source.
const WORDMARK_HEIGHT_DM = (WORDMARK_WIDTH_DM * 118) / 968;
const WORDMARK_POSITION_DM: readonly [number, number, number] = [0, 14, -40];

/**
 * Open Brush's welcome-screen sketch (openbrush_intro_simple.prefab),
 * extracted to a compact binary and rendered with the real brush shaders.
 * The SketchLibrarySystem controls when it shows: on the landing scene and
 * as the "Welcome Sketch" gallery entry; hidden once another sketch starts.
 */
export class IntroSketchSystem extends createSystem({}) {
  private root?: Group;
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
      const manifest = (await manifestResponse.json()) as {
        nodes: IntroNode[];
      };
      const bin = await binResponse.arrayBuffer();
      if (this.removed) {
        return;
      }

      const root = new Group();
      root.name = "OpenBrushIntroSketch";

      for (const node of manifest.nodes) {
        const geometry = this.buildGeometry(node, bin);
        const material = await this.resolveMaterial(node);
        const mesh = new Mesh(geometry, material);
        mesh.name = `OpenBrushIntro_${node.materialName}`;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        root.add(mesh);
      }
      if (this.removed) {
        return;
      }
      root.add(this.createWordmark());

      root.scale.setScalar(INTRO_SCALE);
      root.visible = this.desiredVisible;
      this.root = root;
      this.world.scene.add(root);
      this.loaded = true;
    } catch (error) {
      console.warn("Intro sketch failed to load:", error);
      this.loaded = true;
    }
  }

  /** The Brushspace wordmark, headlining the Tilt Brush signage. */
  private createWordmark(): Mesh {
    const texture = new TextureLoader().load(WORDMARK_URL);
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

  private buildGeometry(node: IntroNode, bin: ArrayBuffer): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array(bin, node.positionsOffset, node.vertexCount * 3),
        3,
      ),
    );
    if (node.normalsOffset >= 0) {
      geometry.setAttribute(
        "normal",
        new BufferAttribute(
          new Float32Array(bin, node.normalsOffset, node.vertexCount * 3),
          3,
        ),
      );
    }
    if (node.colorsOffset >= 0) {
      geometry.setAttribute(
        "color",
        new BufferAttribute(
          new Uint8Array(bin, node.colorsOffset, node.vertexCount * 4),
          4,
          true,
        ),
      );
    }
    if (node.uv0Offset >= 0 && node.uv0Dimension > 0) {
      geometry.setAttribute(
        "uv",
        new BufferAttribute(
          new Float32Array(
            bin,
            node.uv0Offset,
            node.vertexCount * node.uv0Dimension,
          ),
          node.uv0Dimension,
        ),
      );
    }
    if (node.uv1Offset >= 0 && node.uv1Dimension > 0) {
      geometry.setAttribute(
        "uv1",
        new BufferAttribute(
          new Float32Array(
            bin,
            node.uv1Offset,
            node.vertexCount * node.uv1Dimension,
          ),
          node.uv1Dimension,
        ),
      );
    }
    geometry.setIndex(
      new BufferAttribute(
        new Uint32Array(bin, node.indicesOffset, node.indexCount),
        1,
      ),
    );
    applyBrushShaderAttributeAliases(geometry);
    return geometry;
  }

  private async resolveMaterial(node: IntroNode) {
    if (node.brushGuid) {
      const entry = findBrushByGuid(openBrushInventory, node.brushGuid);
      if (entry) {
        const material = await openBrushShaderLibrary.load(entry, {
          allowAnyGeometry: true,
        });
        if (material) {
          return material;
        }
      }
    }
    return new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
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
  }
}

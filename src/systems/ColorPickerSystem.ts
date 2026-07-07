import {
  CircleGeometry,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PanelDocument,
  PanelUI,
  PlaneGeometry,
  Quaternion,
  RayInteractable,
  RingGeometry,
  ShaderMaterial,
  UIKitDocument,
  Vector3,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushSettings,
  InputCommandState,
  OpenBrushColorFavorites,
  OpenBrushColorPicker,
  OpenBrushCustomPanel,
  OpenBrushPanelAttachment,
  OpenBrushTipAnchor,
  SettingsState,
} from "../components/OpenBrushCore.js";
import { openBrushInventory } from "../openbrush/brush-catalog.js";
import { findBrushByGuid } from "../openbrush/brush-inventory.js";
import {
  applyColorWheelConstraints,
  colorWheelMatchesRgb,
  hslToRgb,
  pickColorWheel,
  pickColorWheelSlider,
  rgbToHsl,
  type ColorWheelState,
} from "../openbrush/color-wheel.js";
import {
  OPEN_BRUSH_COLOR_FAVORITE_SLOTS,
  addOpenBrushColorFavorite,
  colorFavoriteCss,
} from "../openbrush/color-favorites.js";
import { clearUIKitInteractionStateExcept } from "../openbrush/uikit-interaction.js";
import type { Rgba } from "../openbrush/types.js";

// Geometry is authored in "panel units" sized to the wand prism face (the
// UIKit panel used RING_PANEL_MAX_WIDTH = 0.82); the attachment system bakes
// the prism scale into object3D.scale for non-PanelUI panels.
const WHEEL_RADIUS = 0.3;
const WHEEL_CENTER_X = -0.09;
// The face is taller than wide (RING_PANEL_MAX_HEIGHT); the wheel sits in the
// upper region and the favorites strip fills the band below.
const WHEEL_CENTER_Y = 0.13;
const FAVORITES_CENTER_Y = -0.4;
const FAVORITES_WIDTH = 0.76;
const FAVORITES_HEIGHT = 0.12;
const SLIDER_WIDTH = 0.12;
const SLIDER_HEIGHT = 0.6;
const SLIDER_CENTER_X = 0.33;
const CURSOR_RADIUS = 0.035;
const KNOB_HEIGHT = 0.035;
const FRONT_EPSILON = 0.004;

const GLSL_HSL_TO_RGB = /* glsl */ `
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float h6 = fract(h) * 6.0;
  float x = c * (1.0 - abs(mod(h6, 2.0) - 1.0));
  vec3 rgb =
    h6 < 1.0 ? vec3(c, x, 0.0) :
    h6 < 2.0 ? vec3(x, c, 0.0) :
    h6 < 3.0 ? vec3(0.0, c, x) :
    h6 < 4.0 ? vec3(0.0, x, c) :
    h6 < 5.0 ? vec3(x, 0.0, c) :
               vec3(c, 0.0, x);
  return rgb + vec3(l - c * 0.5);
}
`;

const PANEL_VERTEX_SHADER = /* glsl */ `
varying vec2 vPanelUv;
void main() {
  vPanelUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// HS_L_Polar wheel: hue = angle (red at +X), saturation = radius, rendered at
// the current lightness, like Open Brush's color picker disk.
const WHEEL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
varying vec2 vPanelUv;
uniform float u_Lightness;
uniform float u_SaturationMax;
${GLSL_HSL_TO_RGB}
void main() {
  vec2 p = vPanelUv * 2.0 - 1.0;
  float radius = length(p);
  if (radius > 1.0) {
    discard;
  }
  float hue = atan(p.y, p.x) / 6.2831853;
  float saturation = min(radius, u_SaturationMax);
  vec3 rgb = hsl2rgb(hue, saturation, u_Lightness);
  // Soften the rim so the disk edge does not alias hard.
  float rim = 1.0 - smoothstep(0.985, 1.0, radius);
  gl_FragColor = vec4(rgb, rim);
}
`;

// Lightness ramp for the current hue/saturation (slider column).
const SLIDER_FRAGMENT_SHADER = /* glsl */ `
precision highp float;
varying vec2 vPanelUv;
uniform float u_Hue;
uniform float u_Saturation;
${GLSL_HSL_TO_RGB}
void main() {
  vec3 rgb = hsl2rgb(u_Hue, u_Saturation, vPanelUv.y);
  gl_FragColor = vec4(rgb, 1.0);
}
`;

export class ColorPickerSystem extends createSystem({
  pickers: { required: [OpenBrushColorPicker, OpenBrushPanelAttachment] },
  brushSettings: { required: [BrushSettings] },
  commands: { required: [InputCommandState] },
  settings: { required: [SettingsState] },
  tipAnchors: { required: [OpenBrushTipAnchor] },
}) {
  private wheelMaterial!: ShaderMaterial;
  private sliderMaterial!: ShaderMaterial;
  private cursor!: Mesh;
  private knob!: Mesh;
  private root!: Group;

  private readonly state: ColorWheelState = {
    hue01: 0.5833,
    saturation: 0.81,
    lightness: 0.525,
  };
  private activeRegion: "wheel" | "slider" | undefined;
  private previousPaintPressed = false;
  private cachedBrushGuid: string | undefined;
  private cachedLuminanceMin = 0;
  private cachedSaturationMax = 1;
  private readonly lastReconciledColor = new Float32Array([NaN, NaN, NaN]);
  private readonly matchScratch: [number, number, number, number] = [0, 0, 0, 1];

  private favoritesEntity?: Entity;
  private favoritesBound = false;
  private appliedFavoritesRevision = -1;
  private readonly favoriteScratch: Rgba = [0, 0, 0, 1];

  private readonly rayOrigin = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly rayQuaternion = new Quaternion();
  private readonly inverseMatrix = new Matrix4();
  private readonly localOrigin = new Vector3();
  private readonly localDirection = new Vector3();

  init() {
    this.wheelMaterial = new ShaderMaterial({
      name: "OpenBrushColorWheel",
      vertexShader: PANEL_VERTEX_SHADER,
      fragmentShader: WHEEL_FRAGMENT_SHADER,
      uniforms: {
        u_Lightness: { value: this.state.lightness },
        u_SaturationMax: { value: 1 },
      },
      transparent: true,
      side: FrontSide,
    });
    this.sliderMaterial = new ShaderMaterial({
      name: "OpenBrushColorSlider",
      vertexShader: PANEL_VERTEX_SHADER,
      fragmentShader: SLIDER_FRAGMENT_SHADER,
      uniforms: {
        u_Hue: { value: this.state.hue01 },
        u_Saturation: { value: this.state.saturation },
      },
      side: FrontSide,
    });

    this.root = new Group();
    this.root.name = "OpenBrushWandColorPanel";

    const wheel = new Mesh(new CircleGeometry(WHEEL_RADIUS, 72), this.wheelMaterial);
    wheel.name = "OpenBrushColorWheelDisk";
    wheel.position.set(WHEEL_CENTER_X, WHEEL_CENTER_Y, 0);
    this.root.add(wheel);

    const slider = new Mesh(
      new PlaneGeometry(SLIDER_WIDTH, SLIDER_HEIGHT),
      this.sliderMaterial,
    );
    slider.name = "OpenBrushColorWheelSlider";
    slider.position.set(SLIDER_CENTER_X, WHEEL_CENTER_Y, 0);
    this.root.add(slider);

    this.cursor = new Mesh(
      new RingGeometry(CURSOR_RADIUS * 0.72, CURSOR_RADIUS, 32),
      new MeshBasicMaterial({ color: 0xffffff, side: FrontSide }),
    );
    this.cursor.name = "OpenBrushColorWheelCursor";
    this.cursor.position.z = FRONT_EPSILON;
    this.root.add(this.cursor);

    this.knob = new Mesh(
      new PlaneGeometry(SLIDER_WIDTH * 1.3, KNOB_HEIGHT),
      new MeshBasicMaterial({ color: 0xffffff, side: FrontSide }),
    );
    this.knob.name = "OpenBrushColorWheelKnob";
    this.knob.position.x = SLIDER_CENTER_X;
    this.knob.position.z = FRONT_EPSILON;
    this.root.add(this.knob);

    const entity = this.world.createTransformEntity(this.root);
    entity.object3D!.name = "OpenBrushWandColorPanel";
    entity
      .addComponent(OpenBrushColorPicker, {
        hue01: this.state.hue01,
        saturation: this.state.saturation,
        lightness: this.state.lightness,
      })
      .addComponent(OpenBrushColorFavorites)
      .addComponent(OpenBrushCustomPanel)
      .addComponent(OpenBrushPanelAttachment, {
        role: "color",
        mode: "fixed-ring",
      });

    this.createFavoritesPanel(entity);
    this.syncVisuals();
  }

  update() {
    const picker = this.getFirstEntity("pickers");
    const settingsEntity = this.getFirstEntity("brushSettings");
    if (!picker || !settingsEntity) {
      return;
    }

    const color = settingsEntity.getVectorView(BrushSettings, "color") as Float32Array;
    const brushGuid = String(settingsEntity.getValue(BrushSettings, "brushGuid"));
    const brushChanged = brushGuid !== this.cachedBrushGuid;
    if (brushChanged) {
      this.cachedBrushGuid = brushGuid;
      const brushEntry = findBrushByGuid(openBrushInventory, brushGuid);
      this.cachedLuminanceMin = brushEntry?.geometryParams?.colorLuminanceMin ?? 0;
      this.cachedSaturationMax = brushEntry?.geometryParams?.colorSaturationMax ?? 1;
    }
    const colorChanged =
      color[0] !== this.lastReconciledColor[0] ||
      color[1] !== this.lastReconciledColor[1] ||
      color[2] !== this.lastReconciledColor[2];

    // The reconcile path allocates (HSL round trips); only run it when the
    // color or the active brush actually changed.
    if (brushChanged || colorChanged) {
      // Adopt external color changes (dropper, picked stroke, defaults) while
      // keeping the hue stable for achromatic colors.
      this.matchScratch[0] = color[0];
      this.matchScratch[1] = color[1];
      this.matchScratch[2] = color[2];
      if (colorChanged && !colorWheelMatchesRgb(this.state, this.matchScratch)) {
        const derived = rgbToHsl(color[0], color[1], color[2], this.state.hue01);
        this.state.hue01 = derived.hue01;
        this.state.saturation = derived.saturation;
        this.state.lightness = derived.lightness;
      }

      // Per-brush constraints, like ColorPickerUtils.ApplySliderConstraint.
      const constrained = applyColorWheelConstraints(
        this.state,
        this.cachedLuminanceMin,
        this.cachedSaturationMax,
      );
      if (
        constrained.saturation !== this.state.saturation ||
        constrained.lightness !== this.state.lightness
      ) {
        this.state.saturation = constrained.saturation;
        this.state.lightness = constrained.lightness;
        this.writeBrushColor(settingsEntity);
      }
    }

    this.handlePointer(
      picker,
      settingsEntity,
      this.cachedLuminanceMin,
      this.cachedSaturationMax,
    );
    this.lastReconciledColor[0] = color[0];
    this.lastReconciledColor[1] = color[1];
    this.lastReconciledColor[2] = color[2];
    this.writePickerComponent(picker);
    this.syncVisuals();
    this.updateFavorites(picker, settingsEntity);
  }

  private handlePointer(
    picker: Entity,
    settingsEntity: Entity,
    luminanceMin: number,
    saturationMax: number,
  ): void {
    const commandEntity = this.getFirstEntity("commands");
    const paintPressed = Boolean(
      commandEntity?.getValue(InputCommandState, "paintPressed"),
    );
    const pressStarted = paintPressed && !this.previousPaintPressed;
    this.previousPaintPressed = paintPressed;

    if (!paintPressed) {
      this.activeRegion = undefined;
      picker.setValue(OpenBrushColorPicker, "pointerActive", false);
      return;
    }
    if (!this.root.visible || picker.object3D?.visible === false) {
      this.activeRegion = undefined;
      return;
    }

    const hit = this.intersectPickerPlane();
    if (!hit) {
      return;
    }
    const [localX, localY] = hit;

    if (!this.activeRegion) {
      // Only begin a drag on the frame the trigger is pressed while aiming at
      // the picker, so sweeping the ray across it mid-stroke does nothing.
      if (!pressStarted) {
        return;
      }
      const wheelPick = pickColorWheel(
        localX - WHEEL_CENTER_X,
        localY - WHEEL_CENTER_Y,
        WHEEL_RADIUS,
        0,
      );
      if (wheelPick.hit) {
        this.activeRegion = "wheel";
      } else if (
        Math.abs(localX - SLIDER_CENTER_X) <= SLIDER_WIDTH &&
        Math.abs(localY - WHEEL_CENTER_Y) <= SLIDER_HEIGHT / 2 + KNOB_HEIGHT
      ) {
        this.activeRegion = "slider";
      } else {
        return;
      }
    }

    if (this.activeRegion === "wheel") {
      const pick = pickColorWheel(
        localX - WHEEL_CENTER_X,
        localY - WHEEL_CENTER_Y,
        WHEEL_RADIUS,
        Number.POSITIVE_INFINITY,
      );
      this.state.hue01 = pick.hue01;
      this.state.saturation = Math.min(pick.saturation, saturationMax);
    } else {
      this.state.lightness = Math.max(
        pickColorWheelSlider(localY - WHEEL_CENTER_Y, SLIDER_HEIGHT),
        luminanceMin,
      );
    }
    picker.setValue(OpenBrushColorPicker, "pointerActive", true);
    this.writeBrushColor(settingsEntity);
  }

  /** Returns the pointer ray's hit on the picker plane in root-local units. */
  private intersectPickerPlane(): [number, number] | undefined {
    const settings = this.getFirstEntity("settings");
    const hand =
      String(settings?.getValue(SettingsState, "dominantHand")) === "left"
        ? "left"
        : "right";
    const raySpace = this.getTipAnchorObject(hand);
    if (!raySpace) {
      return undefined;
    }
    raySpace.getWorldPosition(this.rayOrigin);
    raySpace.getWorldQuaternion(this.rayQuaternion);
    this.rayDirection.set(0, 0, -1).applyQuaternion(this.rayQuaternion);

    this.inverseMatrix.copy(this.root.matrixWorld).invert();
    this.localOrigin.copy(this.rayOrigin).applyMatrix4(this.inverseMatrix);
    this.localDirection
      .copy(this.rayDirection)
      .transformDirection(this.inverseMatrix);

    // Only pickable from the front, matching the front-face-only rendering.
    if (this.localOrigin.z <= 0 || this.localDirection.z >= -1e-6) {
      return undefined;
    }
    const t = -this.localOrigin.z / this.localDirection.z;
    return [
      this.localOrigin.x + this.localDirection.x * t,
      this.localOrigin.y + this.localDirection.y * t,
    ];
  }

  private writeBrushColor(settingsEntity: Entity): void {
    const rgba = hslToRgb(
      this.state.hue01,
      this.state.saturation,
      this.state.lightness,
    );
    // Vector fields must be written through their view, not setValue.
    const color = settingsEntity.getVectorView(BrushSettings, "color") as Float32Array;
    color[0] = rgba[0];
    color[1] = rgba[1];
    color[2] = rgba[2];
    if (!(color[3] > 0)) {
      color[3] = 1;
    }
  }

  private writePickerComponent(picker: Entity): void {
    picker.setValue(OpenBrushColorPicker, "hue01", this.state.hue01);
    picker.setValue(OpenBrushColorPicker, "saturation", this.state.saturation);
    picker.setValue(OpenBrushColorPicker, "lightness", this.state.lightness);
  }

  private syncVisuals(): void {
    this.wheelMaterial.uniforms.u_Lightness.value = this.state.lightness;
    this.sliderMaterial.uniforms.u_Hue.value = this.state.hue01;
    this.sliderMaterial.uniforms.u_Saturation.value = this.state.saturation;

    const angle = this.state.hue01 * Math.PI * 2;
    const radius = this.state.saturation * WHEEL_RADIUS;
    this.cursor.position.x = WHEEL_CENTER_X + Math.cos(angle) * radius;
    this.cursor.position.y = WHEEL_CENTER_Y + Math.sin(angle) * radius;
    this.knob.position.y =
      WHEEL_CENTER_Y + (this.state.lightness - 0.5) * SLIDER_HEIGHT;
  }

  /**
   * The saved-swatches strip under the wheel: a UIKit panel (the "+" button
   * and swatch circles) riding the custom color panel — sizes divide out the
   * parent's prism scale via PanelUISystem.
   */
  private createFavoritesPanel(colorPanel: Entity): void {
    const favorites = this.world
      .createTransformEntity(undefined, colorPanel)
      .addComponent(PanelUI, {
        config: "./ui/wand-color-favorites.json",
        maxWidth: FAVORITES_WIDTH,
        maxHeight: FAVORITES_HEIGHT,
      })
      .addComponent(RayInteractable);
    favorites.object3D!.name = "OpenBrushColorFavoritesPanel";
    favorites.object3D!.position.set(0, FAVORITES_CENTER_Y, FRONT_EPSILON);
    this.favoritesEntity = favorites;
  }

  private updateFavorites(picker: Entity, settingsEntity: Entity): void {
    const favorites = this.favoritesEntity;
    if (!favorites) {
      return;
    }
    // Panel units scale with the prism face; keep PanelUI sizes in world
    // units matched to the current face scale.
    const faceScale = this.root.scale.x || 1;
    const maxWidth = FAVORITES_WIDTH * faceScale;
    if (Number(favorites.getValue(PanelUI, "maxWidth")) !== maxWidth) {
      favorites.setValue(PanelUI, "maxWidth", maxWidth);
    }
    const maxHeight = FAVORITES_HEIGHT * faceScale;
    if (Number(favorites.getValue(PanelUI, "maxHeight")) !== maxHeight) {
      favorites.setValue(PanelUI, "maxHeight", maxHeight);
    }

    const document = PanelDocument.data.document[
      favorites.index
    ] as UIKitDocument;
    if (!document) {
      return;
    }
    if (!this.favoritesBound) {
      this.favoritesBound = true;
      this.bindFavorites(document, picker, settingsEntity);
    }
    const revision = Number(picker.getValue(OpenBrushColorFavorites, "revision"));
    if (revision !== this.appliedFavoritesRevision) {
      this.appliedFavoritesRevision = revision;
      this.syncFavoriteSwatches(document, picker);
    }
  }

  private bindFavorites(
    document: UIKitDocument,
    picker: Entity,
    settingsEntity: Entity,
  ): void {
    const addButton = document.getElementById("favorite-add") as {
      addEventListener(type: string, listener: () => void): void;
    } | null;
    addButton?.addEventListener("click", () => {
      clearUIKitInteractionStateExcept(document, addButton);
      this.addCurrentColorToFavorites(picker, settingsEntity);
    });
    for (let slot = 0; slot < OPEN_BRUSH_COLOR_FAVORITE_SLOTS; slot += 1) {
      const swatch = document.getElementById(`favorite-${slot}`) as {
        addEventListener(type: string, listener: () => void): void;
      } | null;
      swatch?.addEventListener("click", () => {
        clearUIKitInteractionStateExcept(document, swatch);
        this.applyFavorite(picker, settingsEntity, slot);
      });
    }
  }

  private addCurrentColorToFavorites(
    picker: Entity,
    settingsEntity: Entity,
  ): void {
    const color = settingsEntity.getVectorView(BrushSettings, "color") as Float32Array;
    const current = this.readFavorites(picker);
    const next = addOpenBrushColorFavorite(current, [
      color[0],
      color[1],
      color[2],
      1,
    ]);
    this.writeFavorites(picker, next);
  }

  private applyFavorite(
    picker: Entity,
    settingsEntity: Entity,
    slot: number,
  ): void {
    if (slot >= Number(picker.getValue(OpenBrushColorFavorites, "count"))) {
      return;
    }
    const favorite = picker.getVectorView(
      OpenBrushColorFavorites,
      `favorite${slot}` as "favorite0",
    ) as Float32Array;
    const color = settingsEntity.getVectorView(BrushSettings, "color") as Float32Array;
    color[0] = favorite[0];
    color[1] = favorite[1];
    color[2] = favorite[2];
    color[3] = 1;
  }

  private readFavorites(picker: Entity): Rgba[] {
    const count = Math.min(
      Number(picker.getValue(OpenBrushColorFavorites, "count")),
      OPEN_BRUSH_COLOR_FAVORITE_SLOTS,
    );
    const favorites: Rgba[] = [];
    for (let slot = 0; slot < count; slot += 1) {
      const view = picker.getVectorView(
        OpenBrushColorFavorites,
        `favorite${slot}` as "favorite0",
      ) as Float32Array;
      favorites.push([view[0], view[1], view[2], view[3]]);
    }
    return favorites;
  }

  private writeFavorites(picker: Entity, favorites: readonly Rgba[]): void {
    for (let slot = 0; slot < favorites.length; slot += 1) {
      const view = picker.getVectorView(
        OpenBrushColorFavorites,
        `favorite${slot}` as "favorite0",
      ) as Float32Array;
      view[0] = favorites[slot][0];
      view[1] = favorites[slot][1];
      view[2] = favorites[slot][2];
      view[3] = 1;
    }
    picker.setValue(OpenBrushColorFavorites, "count", favorites.length);
    picker.setValue(
      OpenBrushColorFavorites,
      "revision",
      Number(picker.getValue(OpenBrushColorFavorites, "revision")) + 1,
    );
  }

  private syncFavoriteSwatches(document: UIKitDocument, picker: Entity): void {
    const count = Number(picker.getValue(OpenBrushColorFavorites, "count"));
    for (let slot = 0; slot < OPEN_BRUSH_COLOR_FAVORITE_SLOTS; slot += 1) {
      const swatch = document.getElementById(`favorite-${slot}`) as {
        setProperties(properties: Record<string, unknown>): void;
      } | null;
      if (!swatch) {
        continue;
      }
      if (slot >= count) {
        swatch.setProperties({
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderColor: "rgba(255, 255, 255, 0.2)",
        });
        continue;
      }
      const view = picker.getVectorView(
        OpenBrushColorFavorites,
        `favorite${slot}` as "favorite0",
      ) as Float32Array;
      this.favoriteScratch[0] = view[0];
      this.favoriteScratch[1] = view[1];
      this.favoriteScratch[2] = view[2];
      swatch.setProperties({
        backgroundColor: colorFavoriteCss(this.favoriteScratch),
        borderColor: "rgba(255, 255, 255, 0.55)",
      });
    }
  }

  private getTipAnchorObject(
    hand: "left" | "right",
  ): NonNullable<Entity["object3D"]> | undefined {
    for (const anchor of this.queries.tipAnchors.entities) {
      if (
        String(anchor.getValue(OpenBrushTipAnchor, "hand")) === hand &&
        anchor.object3D
      ) {
        return anchor.object3D;
      }
    }
    return undefined;
  }

  private getFirstEntity(
    queryName: "pickers" | "brushSettings" | "commands" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

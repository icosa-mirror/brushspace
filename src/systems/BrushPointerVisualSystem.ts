import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  createSystem,
} from "@iwsdk/core";
import type { Entity } from "@iwsdk/core";

import {
  BrushPointer,
  BrushSettings,
  InputCommandState,
  OpenBrushAppState,
  OpenBrushScenePose,
  SettingsState,
} from "../components/OpenBrushCore.js";
import {
  OPEN_BRUSH_DEFAULT_STARTUP_LIVE_BRUSH_SIZE,
  normalizeBrushSize,
} from "../openbrush/brush-size.js";
import { resolveOpenBrushToolSphereCursor } from "../openbrush/eraser-cursor.js";

const POINTER_VISUAL_ROOT_NAME = "OpenBrushPointerTipVisual";
const POINTER_CONE_NAME = "OpenBrushPointerConeTip";
const POINTER_BRUSH_SIZE_RING_NAME = "OpenBrushBrushSizeRing";
const POINTER_CONE_LENGTH = 0.0225;
const POINTER_CONE_RADIUS = 0.007;
const POINTER_CONE_SEGMENTS = 12;
const POINTER_RING_FRONT_OFFSET = -0.002;
// The ring previews the true stroke diameter, matching Open Brush's pointer
// size indicator: ring diameter == live brush size in meters.
const POINTER_RING_DIAMETER_SCALE = 1;

interface BrushPointerVisualParts {
  root: Group;
  ring: Mesh;
}

export class BrushPointerVisualSystem extends createSystem({
  pointers: { required: [BrushPointer] },
  brushSettings: { required: [BrushSettings] },
  appState: { required: [OpenBrushAppState] },
  scenePoses: { required: [OpenBrushScenePose] },
  settings: { required: [SettingsState] },
  commands: { required: [InputCommandState] },
}) {
  private readonly sphereCursorScratch = {
    visible: false,
    radius: 0,
    forwardOffset: 0,
    spins: false,
  };
  private readonly visuals = new Map<number, BrushPointerVisualParts>();
  private coneGeometry!: BufferGeometry;
  private ringGeometry!: RingGeometry;
  private coneMaterial!: MeshBasicMaterial;
  private ringMaterial!: MeshBasicMaterial;

  init() {
    this.coneGeometry = createPointerConeGeometry();
    this.ringGeometry = new RingGeometry(0.46, 0.5, 64);
    this.coneMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      side: DoubleSide,
    });
    this.ringMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      side: DoubleSide,
    });
  }

  update() {
    const activeHand = this.getDominantHand();
    const brushDiameter = this.getBrushIndicatorDiameter();
    // Tools that present the sphere cursor (eraser, pick tools) replace the
    // drawing tip entirely, like Open Brush swapping the pointer for the tool
    // mesh.
    const replacedBySphereCursor = this.isTipReplacedBySphereCursor();
    const worldGrabActive = this.isWorldGrabActive();
    // While the UI ray is on a panel the trigger belongs to the UI, so the
    // drawing tip hides along with the rest of the tool affordances.
    const pointerOnUi = this.isPointerOnUi();
    for (const entity of this.queries.pointers.entities) {
      const visual = this.getOrCreateVisual(entity);
      if (!visual) {
        continue;
      }
      const visible =
        !replacedBySphereCursor &&
        !worldGrabActive &&
        !pointerOnUi &&
        String(entity.getValue(BrushPointer, "hand")) === activeHand;
      visual.root.visible = visible;
      if (visible) {
        visual.ring.scale.setScalar(brushDiameter);
      }
    }
  }

  private getOrCreateVisual(
    entity: Entity,
  ): BrushPointerVisualParts | undefined {
    const existing = this.visuals.get(entity.index);
    if (existing) {
      return existing;
    }
    if (!entity.object3D) {
      return undefined;
    }

    const root = new Group();
    root.name = POINTER_VISUAL_ROOT_NAME;

    const cone = new Mesh(this.coneGeometry, this.coneMaterial);
    cone.name = POINTER_CONE_NAME;
    root.add(cone);

    const ring = new Mesh(this.ringGeometry, this.ringMaterial);
    ring.name = POINTER_BRUSH_SIZE_RING_NAME;
    ring.position.z = POINTER_RING_FRONT_OFFSET;
    root.add(ring);

    entity.object3D.add(root);
    const visual = { root, ring };
    this.visuals.set(entity.index, visual);
    return visual;
  }

  private isWorldGrabActive(): boolean {
    const next = this.queries.scenePoses.entities.values().next();
    const pose = next.done ? undefined : next.value;
    return Boolean(pose?.getValue(OpenBrushScenePose, "grabActive"));
  }

  private isPointerOnUi(): boolean {
    const next = this.queries.commands.entities.values().next();
    const commands = next.done ? undefined : next.value;
    return Boolean(commands?.getValue(InputCommandState, "pointerOnUi"));
  }

  private isTipReplacedBySphereCursor(): boolean {
    const next = this.queries.appState.entities.values().next();
    const appState = next.done ? undefined : next.value;
    if (!appState) {
      return false;
    }
    const activeTool = String(appState.getValue(OpenBrushAppState, "activeTool"));
    if (activeTool === "camera") {
      return true;
    }
    return resolveOpenBrushToolSphereCursor(
      activeTool,
      "visible",
      0,
      this.sphereCursorScratch,
    ).visible;
  }

  private getDominantHand(): "left" | "right" {
    const settings = this.getFirstEntity("settings");
    return String(settings?.getValue(SettingsState, "dominantHand")) === "left"
      ? "left"
      : "right";
  }

  private getBrushIndicatorDiameter(): number {
    const settings = this.getFirstEntity("brushSettings");
    const brushSize = settings
      ? normalizeBrushSize(Number(settings.getValue(BrushSettings, "size")))
      : 0.02;
    return brushSize * POINTER_RING_DIAMETER_SCALE;
  }

  private getFirstEntity(
    queryName: "brushSettings" | "settings",
  ): Entity | undefined {
    const next = this.queries[queryName].entities.values().next();
    return next.done ? undefined : next.value;
  }
}

function createPointerConeGeometry(): BufferGeometry {
  const positions = new Float32Array((POINTER_CONE_SEGMENTS + 2) * 3);
  const indices = new Uint16Array(POINTER_CONE_SEGMENTS * 6);
  writePosition(positions, 0, 0, 0, 0);
  for (let index = 0; index < POINTER_CONE_SEGMENTS; index += 1) {
    const angle = (index / POINTER_CONE_SEGMENTS) * Math.PI * 2;
    writePosition(
      positions,
      index + 1,
      Math.cos(angle) * POINTER_CONE_RADIUS,
      Math.sin(angle) * POINTER_CONE_RADIUS,
      POINTER_CONE_LENGTH,
    );
  }
  const baseCenter = POINTER_CONE_SEGMENTS + 1;
  writePosition(positions, baseCenter, 0, 0, POINTER_CONE_LENGTH);

  for (let index = 0; index < POINTER_CONE_SEGMENTS; index += 1) {
    const next = (index + 1) % POINTER_CONE_SEGMENTS;
    const ringIndex = index + 1;
    const nextRingIndex = next + 1;
    const sideOffset = index * 6;
    indices[sideOffset] = 0;
    indices[sideOffset + 1] = nextRingIndex;
    indices[sideOffset + 2] = ringIndex;
    indices[sideOffset + 3] = baseCenter;
    indices[sideOffset + 4] = ringIndex;
    indices[sideOffset + 5] = nextRingIndex;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function writePosition(
  positions: Float32Array,
  index: number,
  x: number,
  y: number,
  z: number,
): void {
  const offset = index * 3;
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
}

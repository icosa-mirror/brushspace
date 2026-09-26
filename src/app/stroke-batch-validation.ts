import { Vector3, type World } from "@iwsdk/core";
import { initialLoad } from "./initial-load.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import { FLAT_BATCH_BRUSH_GUID } from "../brushes/stroke-batch-feature.js";
import { openBrushInventory } from "../brushes/brush-catalog.js";
import { openBrushShaderLibrary } from "../brushes/brush-shader-library.js";
import { IntroSketchSystem } from "../systems/intro-sketch-system.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";
import { SketchLibrarySystem } from "../systems/sketch-library-system.js";
import { SelectionSystem } from "../systems/selection-system.js";
import { createSketchDocument } from "../sketch/document.js";
import { readTiltFile, writeTiltFile } from "../sketch/tilt-file.js";
import { BatchedBrushStroke, BrushSettings, BrushStroke, CollabState, ExtractedBatchedBrushStroke, OpenBrushAppState, OpenBrushScenePose, PersistenceState, SelectionState, StrokeHistoryState } from "../components/core.js";
import type { StrokeData } from "../types.js";
import { OPEN_BRUSH_DROPPER_FORWARD_OFFSET } from "../tools/tools.js";
import { exerciseStrokeBatchRemoteLifecycle } from "./stroke-batch-remote-validation.js";
import { sampleStrokeBatchPerformance } from "./stroke-batch-performance-validation.js";

let validationWorld: World | undefined;

declare global {
  interface Window {
    exerciseStrokeBatchLifecycle?: typeof exerciseStrokeBatchLifecycle;
    inspectStrokeBatchHistory?: typeof inspectStrokeBatchHistory;
    manipulateStrokeBatchSelection?: typeof manipulateStrokeBatchSelection;
    transformStrokeBatchCanvas?: () => { scale: number; position: number[]; orientation: number[] };
    setStrokeBatchBrushSize?: (size: number) => void;
    strokeBatchDelayedMaterial?: {
      clear: () => void;
      spawn: (guid: string, offsetX: number, visible: boolean) => ReturnType<typeof inspectStrokeBatchHistory>;
    };
    strokeBatchPersistence?: {
      save: () => void;
      entries: () => ReturnType<SketchLibrarySystem["getGalleryPageEntries"]>;
      open: (id: string) => boolean;
      snapshot: () => StrokeData[];
    };
    exerciseStrokeBatchRemoteLifecycle?: () => ReturnType<typeof exerciseStrokeBatchRemoteLifecycle>;
    sampleStrokeBatchPerformance?: () => ReturnType<typeof sampleStrokeBatchPerformance>;
  }
}

/** Development-only workload using the production loaded-stroke lifecycle. */
export async function setupStrokeBatchValidation(world: World, waitForMaterial = true): Promise<void> {
  if (waitForMaterial) await initialLoad.whenDone;
  const entry = openBrushInventory.find((brush) => brush.guid === FLAT_BATCH_BRUSH_GUID);
  if (!entry || (waitForMaterial && !await openBrushShaderLibrary.load(entry))) {
    throw new Error("[StrokeBatchValidation] Managed Flat material unavailable");
  }
  const authoring = world.getSystem(StrokeAuthoringSystem);
  if (!authoring) throw new Error("[StrokeBatchValidation] Authoring system unavailable");
  world.getSystem(IntroSketchSystem)?.setSketchVisible(false, false);
  world.camera.position.set(0, 1.3, 1);
  world.camera.rotation.set(0, 0, 0);
  const template = createPhase1FixtureDocument().strokes[0];
  const count = waitForMaterial ? 200 : 0;
  world.getSystem(StrokeBatchRenderSystem)!.withDeferredUploads(() => {
    for (let index = 0; index < count; index += 1) {
      const stroke = structuredClone(template);
      stroke.guid = `batch-validation-${index}`;
      stroke.brushGuid = FLAT_BATCH_BRUSH_GUID;
      stroke.brushSize = 0.04;
      stroke.seed = index + 1;
      for (const point of stroke.controlPoints) {
        point.position[0] = point.position[0] * 0.3 + (index % 20 - 9.5) * 0.09;
        point.position[1] = 0.85 + Math.floor(index / 20) * 0.09 + (point.position[1] - 1.2) * 0.3;
        point.position[2] = -0.8 + (point.position[2] + 1.1) * 0.3;
      }
      authoring.spawnStrokeFromData(stroke, true);
    }
  });
  document.documentElement.dataset.strokeBatchValidationCount = String(count);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const geometrySamples: unknown[] = [];
  world.scene.traverse((object) => {
    if (!object.name.startsWith("OpenBrushStrokeBatch_") && object.name !== "OpenBrushStroke_1") return;
    const mesh = object as import("@iwsdk/core").Mesh;
    object.updateWorldMatrix(true, false);
    geometrySamples.push({
      name: object.name,
      matrix: object.matrixWorld.toArray(),
      drawRange: mesh.geometry.drawRange,
      material: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => ({ name: material.name, type: material.type, visible: material.visible, side: material.side, transparent: material.transparent, depthWrite: material.depthWrite })),
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attr]) => [name, { size: attr.itemSize, count: attr.count, first: Array.from(attr.array.slice(0, 12)) }])),
      indices: Array.from(mesh.geometry.index?.array.slice(0, 12) ?? []),
    });
  });
  document.documentElement.dataset.strokeBatchValidationGeometry = JSON.stringify(geometrySamples);
  document.documentElement.dataset.strokeBatchValidation = "ready";
  validationWorld = world;
  window.exerciseStrokeBatchLifecycle = exerciseStrokeBatchLifecycle;
  window.inspectStrokeBatchHistory = inspectStrokeBatchHistory;
  window.manipulateStrokeBatchSelection = manipulateStrokeBatchSelection;
  window.setStrokeBatchBrushSize = (size) => {
    for (const settings of authoring.queries.brushSettings.entities) settings.setValue(BrushSettings, "size", size);
  };
  window.transformStrokeBatchCanvas = () => {
    const pose = [...authoring.queries.scenePoses.entities][0];
    if (!pose?.object3D) throw new Error("[StrokeBatchValidation] Canvas unavailable");
    const object = pose.object3D;
    object.position.set(0.3, 0.1, -0.2);
    object.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.4);
    object.scale.setScalar(1.5);
    pose.setValue(OpenBrushScenePose, "scale", 1.5);
    world.camera.position.multiplyScalar(1.5).applyQuaternion(object.quaternion).add(object.position);
    world.camera.quaternion.premultiply(object.quaternion);
    object.updateWorldMatrix(true, true);
    world.camera.updateWorldMatrix(true, false);
    return { scale: 1.5, position: object.position.toArray(), orientation: object.quaternion.toArray() };
  };
  const library = world.getSystem(SketchLibrarySystem)!;
  window.strokeBatchPersistence = {
    save: () => library.saveActiveSketch(),
    entries: () => library.getGalleryPageEntries(),
    open: (id) => library.openGallerySketch(id),
    snapshot: () => library.collectVisibleStrokeData(),
  };
  if (!waitForMaterial) {
    window.strokeBatchDelayedMaterial = {
      clear: () => world.getSystem(SketchLibrarySystem)!.prepareForCollabJoin(),
      spawn: (guid, offsetX, visible) => {
        const data = structuredClone(template);
        data.guid = guid;
        data.brushGuid = FLAT_BATCH_BRUSH_GUID;
        for (const point of data.controlPoints) point.position[0] += offsetX;
        authoring.finalizeRemoteStroke(data);
        authoring.applyRemoteVisibility([guid], visible);
        return inspectStrokeBatchHistory();
      },
    };
  }
  window.exerciseStrokeBatchRemoteLifecycle = () => exerciseStrokeBatchRemoteLifecycle(world);
  window.sampleStrokeBatchPerformance = () => sampleStrokeBatchPerformance(world);
  console.log(`[StrokeBatchValidation] Ready: ${count} finalized Flat strokes`);
}

/** Observe browser-authored strokes without reaching into private history state. */
function inspectStrokeBatchHistory(prepare: boolean | "eraser" | "dropper" = false) {
  const authoring = validationWorld?.getSystem(StrokeAuthoringSystem);
  if (!authoring) throw new Error("[StrokeBatchValidation] Workload not ready");
  if (prepare) {
    // Browser sampling is 1.5 m from the camera. Move back by the dropper's
    // extra tip offset so its pick sphere reaches the same authored plane.
    if (prepare === "dropper") validationWorld!.camera.translateZ(OPEN_BRUSH_DROPPER_FORWARD_OFFSET);
    for (const appState of authoring.queries.appState.entities) {
      appState.setValue(OpenBrushAppState, "mode", "ready");
      appState.setValue(OpenBrushAppState, "activeTool", typeof prepare === "string" ? prepare : "free-paint");
      appState.setValue(OpenBrushAppState, "previousTool", "free-paint");
    }
    for (const settings of authoring.queries.brushSettings.entities) {
      settings.setValue(BrushSettings, "brushGuid", FLAT_BATCH_BRUSH_GUID);
      if (prepare === "dropper") {
        const otherBrush = openBrushInventory.find((brush) => brush.guid !== FLAT_BATCH_BRUSH_GUID)!;
        settings.setValue(BrushSettings, "brushGuid", otherBrush.guid);
        settings.setValue(BrushSettings, "size", 0.123);
        (settings.getVectorView(BrushSettings, "color") as Float32Array).set([1, 0, 0, 1]);
      }
    }
  }
  const history = [...authoring.queries.history.entities][0];
  const appState = [...authoring.queries.appState.entities][0];
  const settings = [...authoring.queries.brushSettings.entities][0];
  let batchTriangles = 0;
  validationWorld!.scene.traverse((object) => {
    if (!object.name.startsWith("OpenBrushStrokeBatch_")) return;
    const indices = (object as import("@iwsdk/core").Mesh).geometry.index?.array;
    if (!indices) return;
    for (let index = 0; index < indices.length; index += 3) {
      if (indices[index] !== indices[index + 1] && indices[index + 1] !== indices[index + 2]
        && indices[index] !== indices[index + 2]) batchTriangles += 1;
    }
  });
  return {
    batchTriangles,
    activeTool: appState?.getValue(OpenBrushAppState, "activeTool"),
    settings: settings ? {
      brushGuid: settings.getValue(BrushSettings, "brushGuid"),
      size: settings.getValue(BrushSettings, "size"),
      color: Array.from(settings.getVectorView(BrushSettings, "color") as Float32Array),
    } : null,
    undoDepth: history?.getValue(StrokeHistoryState, "undoDepth"),
    redoDepth: history?.getValue(StrokeHistoryState, "redoDepth"),
    persistence: {
      busy: validationWorld!.getSystem(SketchLibrarySystem)!.isOpeningSketch(),
      status: appState?.getValue(PersistenceState, "status"),
      id: appState?.getValue(PersistenceState, "activeSketchId"),
      bytes: appState?.getValue(PersistenceState, "lastTiltByteLength"),
      error: appState?.getValue(PersistenceState, "error"),
    },
    collab: { status: appState?.getValue(CollabState, "status"), code: appState?.getValue(CollabState, "code") },
    strokes: [...authoring.queries.strokes.entities]
      .filter((entity) => !String(entity.getValue(BrushStroke, "guid")).startsWith("batch-validation-"))
      .map((entity) => ({
        guid: String(entity.getValue(BrushStroke, "guid")),
        brushGuid: entity.getValue(BrushStroke, "brushGuid"),
        size: entity.getValue(BrushStroke, "brushSize"),
        color: Array.from(entity.getVectorView(BrushStroke, "color") as Float32Array),
        visible: Boolean(entity.getValue(BrushStroke, "renderVisible")),
        finalized: Boolean(entity.getValue(BrushStroke, "finalized")),
        batched: entity.hasComponent(BatchedBrushStroke),
        selected: Boolean(entity.getValue(BrushStroke, "selected")),
        extracted: entity.hasComponent(ExtractedBatchedBrushStroke),
        objectX: entity.object3D?.position.x,
        serializedX: (entity.object3D?.userData.openBrushStrokeData as StrokeData | undefined)?.controlPoints[0]?.position[0],
        privateVisible: entity.object3D?.visible,
      })),
  };
}

/** Move the production widget; SelectionSystem applies the stroke translation. */
async function manipulateStrokeBatchSelection(guid: string, action: "select" | "move" | "deselect" | "save", deltaX = 0) {
  const world = validationWorld;
  const selection = world?.getSystem(SelectionSystem);
  if (!world || !selection) throw new Error("[StrokeBatchValidation] Selection unavailable");
  const stroke = [...selection.queries.strokes.entities].find((entity) => entity.getValue(BrushStroke, "guid") === guid);
  if (!stroke) throw new Error("[StrokeBatchValidation] Selection target missing");
  if (action === "save") {
    const saved = world.getSystem(SketchLibrarySystem)!.collectVisibleStrokeData().find((data) => data.guid === guid);
    if (!saved) throw new Error("[StrokeBatchValidation] Selected snapshot missing");
    const decoded = readTiltFile(writeTiltFile(createSketchDocument({ strokes: [saved] })));
    return { savedX: saved.controlPoints[0].position[0], roundTripX: decoded.strokes[0].controlPoints[0].position[0] };
  }
  if (action === "move") {
    const widget = [...selection.queries.widgets.entities][0];
    if (!widget?.object3D || !stroke.getValue(BrushStroke, "selected")) throw new Error("[StrokeBatchValidation] Widget not ready");
    widget.object3D.position.x += deltaX;
  } else {
    for (const entity of selection.queries.strokes.entities) entity.setValue(BrushStroke, "selected", action === "select" && entity === stroke);
    for (const state of selection.queries.selectionState.entities) {
      state.setValue(SelectionState, "selectionRevision", Number(state.getValue(SelectionState, "selectionRevision")) + 1);
    }
  }
  for (let frame = 0; frame < 5; frame += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return inspectStrokeBatchHistory();
}

/** Test driver for actual ECS selection reconciliation and renderer transitions. */
export async function exerciseStrokeBatchLifecycle() {
  const world = validationWorld;
  if (!world) throw new Error("[StrokeBatchValidation] Workload not ready");
  const authoring = world.getSystem(StrokeAuthoringSystem)!;
  const renderer = world.getSystem(StrokeBatchRenderSystem)!;
  const stroke = [...authoring.queries.strokes.entities].find(
    (entity) => entity.getValue(BrushStroke, "guid") === "batch-validation-0",
  );
  if (!stroke?.object3D) throw new Error("[StrokeBatchValidation] Missing test stroke");
  const mesh = stroke.object3D as import("@iwsdk/core").Mesh;
  const data = mesh.userData.openBrushStrokeData as StrokeData;
  let savedX: number | null = null;
  let roundTripX: number | null = null;
  const batchMesh = world.scene.getObjectByName("OpenBrushStrokeBatch_1") as import("@iwsdk/core").Mesh | undefined;
  const snapshot = (stage: string) => ({
    stage,
    selected: Boolean(stroke.getValue(BrushStroke, "selected")),
    renderVisible: Boolean(stroke.getValue(BrushStroke, "renderVisible")),
    extracted: stroke.hasComponent(ExtractedBatchedBrushStroke),
    privateVisible: mesh.visible,
    privateVertices: mesh.geometry.getAttribute("position")?.count ?? 0,
    objectX: mesh.position.x,
    minBoundsX: (stroke.getVectorView(BrushStroke, "minBounds") as Float32Array)[0],
    serializedX: data.controlPoints[0].position[0],
    savedX,
    roundTripX,
    uploadBytes: renderer.getUploadedBytes(),
    // This workload puts its first stroke in the first 24 indices of one batch.
    batchSubsetHasTriangles: batchMesh
      ? Array.from(batchMesh.geometry.index?.array.slice(0, 24) ?? []).some((index) => index !== 0)
      : null,
  });
  const tick = async (count = 3) => {
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  };
  const observations = [snapshot("initial")];
  stroke.setValue(BrushStroke, "visible", false);
  await tick();
  observations.push(snapshot("hidden"));
  stroke.setValue(BrushStroke, "visible", true);
  await tick();
  observations.push(snapshot("shown"));
  stroke.setValue(BrushStroke, "selected", true);
  await tick();
  observations.push(snapshot("selected"));
  await tick(10);
  observations.push(snapshot("selected-idle"));
  mesh.position.x += 0.1;
  stroke.setValue(BrushStroke, "selected", false);
  await tick();
  observations.push(snapshot("moved-deselected"));
  stroke.setValue(BrushStroke, "selected", true);
  await tick();
  mesh.position.x += 0.05;
  const saved = world.getSystem(SketchLibrarySystem)!.collectVisibleStrokeData()
    .find((candidate) => candidate.guid === data.guid);
  if (!saved) throw new Error("[StrokeBatchValidation] Saved stroke missing");
  savedX = saved.controlPoints[0].position[0];
  const decoded = readTiltFile(writeTiltFile(createSketchDocument({ strokes: [saved] })));
  roundTripX = decoded.strokes[0].controlPoints[0].position[0];
  observations.push(snapshot("save-flushed"));
  await tick();
  observations.push(snapshot("selected-after-save"));
  await tick(10);
  observations.push(snapshot("after-save-idle"));
  stroke.setValue(BrushStroke, "selected", false);
  await tick();
  observations.push(snapshot("final"));
  if (batchMesh) {
    const beforeScope = renderer.getUploadedBytes();
    renderer.withDeferredUploads(() => {
      renderer.setStrokeVisible("batch-validation-0", false);
      renderer.withDeferredUploads(() => renderer.setStrokeVisible("batch-validation-0", true));
      if (renderer.getUploadedBytes() !== beforeScope) {
        throw new Error("[StrokeBatchValidation] Nested scope flushed early");
      }
    });
    if (renderer.getUploadedBytes() <= beforeScope) {
      throw new Error("[StrokeBatchValidation] Outer scope did not flush");
    }
    observations.push(snapshot("nested-scope-complete"));
    const expectedError = new Error("[StrokeBatchValidation] Intentional scope interruption");
    const beforeThrow = renderer.getUploadedBytes();
    try {
      renderer.withDeferredUploads(() => {
        renderer.setStrokeVisible("batch-validation-0", false);
        throw expectedError;
      });
    } catch (error) {
      if (error !== expectedError) throw error;
    }
    if (renderer.getUploadedBytes() <= beforeThrow) {
      throw new Error("[StrokeBatchValidation] Interrupted scope did not flush");
    }
    renderer.setStrokeVisible("batch-validation-0", true);
    observations.push(snapshot("interrupted-scope-restored"));
  }
  const reloadedData = decoded.strokes[0];
  reloadedData.guid = "batch-validation-roundtrip";
  const reloaded = authoring.spawnStrokeFromData(reloadedData, false);
  const reloadedMinX = (reloaded.getVectorView(BrushStroke, "minBounds") as Float32Array)[0];
  if (Math.abs(reloadedMinX - observations[0].minBoundsX - 0.15) > 1e-5) {
    throw new Error("[StrokeBatchValidation] Reloaded geometry lost or duplicated movement");
  }
  observations.push({ ...snapshot("reloaded"), minBoundsX: reloadedMinX });
  return observations;
}

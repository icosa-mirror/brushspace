import type { World } from "@iwsdk/core";
import { initialLoad } from "./initial-load.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import { FLAT_BATCH_BRUSH_GUID } from "../brushes/stroke-batch-feature.js";
import { openBrushInventory } from "../brushes/brush-catalog.js";
import { openBrushShaderLibrary } from "../brushes/brush-shader-library.js";
import { IntroSketchSystem } from "../systems/intro-sketch-system.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";
import { BrushStroke, ExtractedBatchedBrushStroke } from "../components/core.js";
import type { StrokeData } from "../types.js";

let validationWorld: World | undefined;

declare global {
  interface Window {
    exerciseStrokeBatchLifecycle?: typeof exerciseStrokeBatchLifecycle;
  }
}

/** Development-only workload using the production loaded-stroke lifecycle. */
export async function setupStrokeBatchValidation(world: World): Promise<void> {
  await initialLoad.whenDone;
  const entry = openBrushInventory.find((brush) => brush.guid === FLAT_BATCH_BRUSH_GUID);
  if (!entry || !await openBrushShaderLibrary.load(entry)) {
    throw new Error("[StrokeBatchValidation] Managed Flat material unavailable");
  }
  const authoring = world.getSystem(StrokeAuthoringSystem);
  if (!authoring) throw new Error("[StrokeBatchValidation] Authoring system unavailable");
  world.getSystem(IntroSketchSystem)?.setSketchVisible(false, false);
  world.camera.position.set(0, 1.3, 1);
  world.camera.rotation.set(0, 0, 0);
  const template = createPhase1FixtureDocument().strokes[0];
  const count = 200;
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
  console.log(`[StrokeBatchValidation] Ready: ${count} finalized Flat strokes`);
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
  const batchMesh = world.scene.getObjectByName("OpenBrushStrokeBatch_1") as import("@iwsdk/core").Mesh | undefined;
  const snapshot = (stage: string) => ({
    stage,
    selected: Boolean(stroke.getValue(BrushStroke, "selected")),
    renderVisible: Boolean(stroke.getValue(BrushStroke, "renderVisible")),
    extracted: stroke.hasComponent(ExtractedBatchedBrushStroke),
    privateVisible: mesh.visible,
    privateVertices: mesh.geometry.getAttribute("position")?.count ?? 0,
    objectX: mesh.position.x,
    serializedX: data.controlPoints[0].position[0],
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
  renderer.finishAllExtractions();
  observations.push(snapshot("save-flushed"));
  await tick();
  observations.push(snapshot("selected-after-save"));
  await tick(10);
  observations.push(snapshot("after-save-idle"));
  stroke.setValue(BrushStroke, "selected", false);
  await tick();
  observations.push(snapshot("final"));
  return observations;
}

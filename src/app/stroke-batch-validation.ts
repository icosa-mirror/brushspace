import type { World } from "@iwsdk/core";
import { initialLoad } from "./initial-load.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import { FLAT_BATCH_BRUSH_GUID } from "../brushes/stroke-batch-feature.js";
import { openBrushInventory } from "../brushes/brush-catalog.js";
import { openBrushShaderLibrary } from "../brushes/brush-shader-library.js";
import { IntroSketchSystem } from "../systems/intro-sketch-system.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";

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
    if (!object.name.startsWith("OpenBrushStrokeBatch_")) return;
    const mesh = object as import("@iwsdk/core").Mesh;
    object.updateWorldMatrix(true, false);
    geometrySamples.push({
      name: object.name,
      matrix: object.matrixWorld.toArray(),
      drawRange: mesh.geometry.drawRange,
      attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attr]) => [name, { size: attr.itemSize, count: attr.count, first: Array.from(attr.array.slice(0, 12)) }])),
      indices: Array.from(mesh.geometry.index?.array.slice(0, 12) ?? []),
    });
  });
  document.documentElement.dataset.strokeBatchValidationGeometry = JSON.stringify(geometrySamples);
  document.documentElement.dataset.strokeBatchValidation = "ready";
  console.log(`[StrokeBatchValidation] Ready: ${count} finalized Flat strokes`);
}

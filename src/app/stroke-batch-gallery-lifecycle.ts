import { Mesh, type Entity, type World } from "@iwsdk/core";
import { BatchedBrushStroke, BrushStroke, CanvasLayer, ExtractedBatchedBrushStroke } from "../components/core.js";
import { LayerCanvasSystem } from "../systems/layer-canvas-system.js";
import { SketchLibrarySystem } from "../systems/sketch-library-system.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";
import type { StrokeData } from "../types.js";

/** Dev-only functional checks against actual loaded gallery strokes, not synthetic batch arrays. */
export async function exerciseGalleryBatchLifecycle(world: World) {
  const authoring = world.getSystem(StrokeAuthoringSystem)!;
  const library = world.getSystem(SketchLibrarySystem)!;
  const layers = world.getSystem(LayerCanvasSystem)!;
  const batches = world.getSystem(StrokeBatchRenderSystem)!;
  const check = (condition: unknown, message: string) => {
    if (!condition) throw new Error(`[GalleryBatchLifecycle] ${message}`);
  };
  const tick = async () => {
    for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  };
  const representatives = new Map<string, Entity>();
  for (const stroke of authoring.queries.strokes.entities) {
    if (stroke.hasComponent(BatchedBrushStroke)) {
      const guid = String(stroke.getValue(BrushStroke, "brushGuid"));
      if (!representatives.has(guid)) representatives.set(guid, stroke);
    }
  }
  check(representatives.size > 1, "Expected a mixed-brush loaded sketch");
  const results: { brushGuid: string; vertices: number }[] = [];
  for (const [brushGuid, stroke] of representatives) {
    const guid = String(stroke.getValue(BrushStroke, "guid"));
    const mesh = stroke.object3D as Mesh;
    const data = mesh.userData.openBrushStrokeData as StrokeData;
    const initialX = data.controlPoints[0].position[0];
    const initialPosition = mesh.position.clone();
    authoring.applyRemoteVisibility([guid], false);
    await tick();
    check(!stroke.getValue(BrushStroke, "renderVisible") && !mesh.visible, `${brushGuid}: hide`);
    authoring.applyRemoteVisibility([guid], true);
    await tick();
    check(stroke.getValue(BrushStroke, "renderVisible") && !mesh.visible, `${brushGuid}: show without private duplicate`);
    stroke.setValue(BrushStroke, "selected", true);
    await tick();
    check(stroke.hasComponent(ExtractedBatchedBrushStroke) && mesh.visible, `${brushGuid}: extraction`);
    const vertices = mesh.geometry.getAttribute("position")?.count ?? 0;
    check(vertices > 0, `${brushGuid}: extracted geometry`);
    mesh.position.x += 0.1;
    const saved = library.collectVisibleStrokeData().find((item) => item.guid === guid);
    check(saved && Math.abs(saved.controlPoints[0].position[0] - initialX - 0.1) < 1e-5, `${brushGuid}: save flush`);
    await tick();
    stroke.setValue(BrushStroke, "selected", false);
    await tick();
    check(!mesh.visible && !mesh.geometry.getAttribute("position"), `${brushGuid}: recommit releases private geometry`);
    batches.setStrokeTransform(stroke, initialPosition.toArray());
    check(Math.abs(data.controlPoints[0].position[0] - initialX) < 1e-5, `${brushGuid}: reverse move restores serialized position`);
    results.push({ brushGuid, vertices });
  }
  let layersChecked = 0;
  for (const layer of layers.queries.layers.entities) {
    if (layer.getValue(CanvasLayer, "selectionCanvas")) continue;
    const id = Number(layer.getValue(CanvasLayer, "layerIndex"));
    const wasVisible = Boolean(layer.getValue(CanvasLayer, "visible"));
    layer.setValue(CanvasLayer, "visible", false);
    await tick();
    for (const stroke of authoring.queries.strokes.entities) {
      if (Number(stroke.getValue(BrushStroke, "layerIndex")) === id) {
        check(!stroke.getValue(BrushStroke, "renderVisible"), `Layer ${id}: hidden stroke remained visible`);
      }
    }
    layer.setValue(CanvasLayer, "visible", wasVisible);
    await tick();
    layersChecked++;
  }
  world.scene.traverse((object) => {
    if (object.name.startsWith("OpenBrushStrokeBatch_")) {
      check(!(object as Mesh).frustumCulled, "Batch culling differs from private strokes");
    }
  });
  return { brushesChecked: results.length, layersChecked, results };
}

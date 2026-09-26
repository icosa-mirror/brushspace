import { Box3, Vector3, type World } from "@iwsdk/core";
import { BrushStroke, BatchedBrushStroke, ExtractedBatchedBrushStroke, PersistenceState } from "../components/core.js";
import { initialLoad } from "./initial-load.js";
import { openBrushInventory } from "../brushes/brush-catalog.js";
import { SketchLibrarySystem } from "../systems/sketch-library-system.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";
import { sampleStrokeBatchPerformance } from "./stroke-batch-performance-validation.js";
import { exerciseGalleryBatchLifecycle } from "./stroke-batch-gallery-lifecycle.js";
import { measureStrokeBatchInteractions } from "./stroke-batch-interaction-validation.js";

declare global {
  interface Window { galleryBatchValidation?: ReturnType<typeof createGalleryValidation>; }
}

function createGalleryValidation(world: World) {
  const library = world.getSystem(SketchLibrarySystem)!;
  const authoring = world.getSystem(StrokeAuthoringSystem)!;
  const batches = world.getSystem(StrokeBatchRenderSystem)!;
  const names = new Map(openBrushInventory.map((brush) => [brush.guid, brush.name]));
  let selectedGeometryDisposals = 0;
  let releaseSelectionObserver: (() => void) | undefined;
  return {
    entries: () => library.getGalleryPageEntries(),
    open: (id: string) => library.openGallerySketch(id),
    lifecycle: () => exerciseGalleryBatchLifecycle(world),
    interactions: () => measureStrokeBatchInteractions(world),
    resources: () => {
      let strokes = 0, visible = 0, privateVisible = 0, extracted = 0, batchMeshes = 0, batchTriangles = 0;
      for (const entity of authoring.queries.strokes.entities) {
        strokes += 1;
        visible += Number(Boolean(entity.getValue(BrushStroke, "renderVisible")));
        privateVisible += Number(Boolean(entity.object3D?.visible));
        extracted += Number(entity.hasComponent(ExtractedBatchedBrushStroke));
      }
      world.scene.traverse((object) => {
        if (!object.name.startsWith("OpenBrushStrokeBatch_")) return;
        batchMeshes += 1;
        const indices = (object as import("@iwsdk/core").Mesh).geometry.index?.array;
        if (!object.visible || !indices) return;
        for (let i = 0; i < indices.length; i += 3) {
          if (indices[i] !== indices[i + 1] && indices[i + 1] !== indices[i + 2] && indices[i] !== indices[i + 2]) batchTriangles += 1;
        }
      });
      return { strokes, visible, privateVisible, extracted, batchMeshes, batchTriangles,
        geometries: world.renderer.info.memory.geometries, textures: world.renderer.info.memory.textures,
        programs: world.renderer.info.programs?.length ?? 0, selectedGeometryDisposals, busy: library.isOpeningSketch() };
    },
    selectFirst: async () => {
      const stroke = [...authoring.queries.strokes.entities][0];
      if (!stroke?.object3D) throw new Error("[GalleryBatchValidation] No selection target");
      stroke.setValue(BrushStroke, "selected", true);
      for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      releaseSelectionObserver?.();
      selectedGeometryDisposals = 0;
      const geometry = (stroke.object3D as import("@iwsdk/core").Mesh).geometry;
      const disposed = () => { selectedGeometryDisposals += 1; };
      geometry.addEventListener("dispose", disposed);
      releaseSelectionObserver = () => geometry.removeEventListener("dispose", disposed);
      return { guid: stroke.getValue(BrushStroke, "guid"), extracted: stroke.hasComponent(ExtractedBatchedBrushStroke) };
    },
    clear: () => { library.prepareForCollabJoin(); releaseSelectionObserver?.(); releaseSelectionObserver = undefined; },
    xrStatus: () => ({ presenting: world.renderer.xr.isPresenting,
      views: world.renderer.xr.isPresenting ? world.renderer.xr.getCamera().cameras.length : 0,
      calls: world.renderer.info.render.calls, triangles: world.renderer.info.render.triangles }),
    endXR: () => world.renderer.xr.getSession()?.end(),
    diagnostics: () => {
      const targets: unknown[] = [];
      world.scene.traverse((object) => {
        if (!object.name.startsWith("OpenBrushStrokeBatch_")) return;
        const mesh = object as import("@iwsdk/core").Mesh;
        const geometry = mesh.geometry;
        const index = geometry.index?.array;
        let nonzero = 0;
        for (const value of index ?? []) nonzero += Number(value !== 0);
        targets.push({ name: object.name, visible: object.visible, culled: mesh.frustumCulled,
          parent: object.parent?.name, position: object.position.toArray(), scale: object.scale.toArray(),
          indices: index?.length, nonzero, drawRange: geometry.drawRange,
          sphere: geometry.boundingSphere,
          attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, attr]) => [name, { count: attr.count, size: attr.itemSize, sample: Array.from(attr.array.slice(0, 12)) }])),
        });
      });
      return { targets, camera: world.camera.matrixWorld.toArray() };
    },
    inspect: () => {
      const appState = [...authoring.queries.appState.entities][0];
      const brushes = new Map<string, { guid: string; name: string; strokes: number; batched: number; indices: number; vertices: number }>();
      let visible = 0;
      for (const entity of authoring.queries.strokes.entities) {
        const guid = String(entity.getValue(BrushStroke, "brushGuid"));
        let brush = brushes.get(guid);
        if (!brush) { brush = { guid, name: names.get(guid) ?? "Unknown", strokes: 0, batched: 0, indices: 0, vertices: 0 }; brushes.set(guid, brush); }
        brush.strokes += 1;
        brush.batched += Number(entity.hasComponent(BatchedBrushStroke));
        brush.indices += Number(entity.getValue(BrushStroke, "indexCount"));
        brush.vertices += Number(entity.getValue(BrushStroke, "vertexCount"));
        visible += Number(Boolean(entity.getValue(BrushStroke, "renderVisible")));
      }
      return {
        busy: library.isOpeningSketch(),
        name: appState?.getValue(PersistenceState, "activeSketchName"),
        status: appState?.getValue(PersistenceState, "status"),
        error: appState?.getValue(PersistenceState, "error"),
        visible,
        brushes: [...brushes.values()].sort((a, b) => b.strokes - a.strokes),
        metrics: { ...batches.getMetrics() },
      };
    },
    frame: () => {
      const bounds = new Box3();
      const strokeBounds = new Box3();
      for (const entity of authoring.queries.strokes.entities) {
        strokeBounds.min.fromArray(entity.getVectorView(BrushStroke, "minBounds") as Float32Array);
        strokeBounds.max.fromArray(entity.getVectorView(BrushStroke, "maxBounds") as Float32Array);
        entity.object3D?.parent?.updateWorldMatrix(true, false);
        if (entity.object3D?.parent) strokeBounds.applyMatrix4(entity.object3D.parent.matrixWorld);
        if (!strokeBounds.isEmpty()) bounds.union(strokeBounds);
      }
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      const distance = Math.max(size.y, size.x / world.camera.aspect, size.z) / (2 * Math.tan(world.camera.fov * Math.PI / 360)) * 1.3;
      const position = center.clone().add(new Vector3(0, 0, Math.max(distance, 1) + size.z / 2));
      world.camera.position.copy(world.camera.parent ? world.camera.parent.worldToLocal(position) : position);
      world.camera.far = Math.max(200, distance * 4);
      world.camera.lookAt(center);
      world.camera.updateProjectionMatrix();
      return { center: center.toArray(), size: size.toArray(), camera: world.camera.position.toArray() };
    },
    sample: () => sampleStrokeBatchPerformance(world),
  };
}

export async function setupGalleryBatchValidation(world: World) {
  await initialLoad.whenDone;
  window.galleryBatchValidation = createGalleryValidation(world);
}

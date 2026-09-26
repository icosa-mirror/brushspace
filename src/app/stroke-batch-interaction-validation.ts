import type { World } from "@iwsdk/core";
import { BrushStroke, ExtractedBatchedBrushStroke } from "../components/core.js";
import { StrokeAuthoringSystem } from "../systems/stroke-authoring-system.js";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";
import { SketchLibrarySystem } from "../systems/sketch-library-system.js";

/** Dev-only CPU/requested-upload observations; not GPU or input latency. */
export async function measureStrokeBatchInteractions(world: World) {
  const authoring = world.getSystem(StrokeAuthoringSystem)!;
  const renderer = world.getSystem(StrokeBatchRenderSystem)!;
  const library = world.getSystem(SketchLibrarySystem)!;
  const strokes = [...authoring.queries.strokes.entities];
  const results = [];
  for (const count of [1, Math.min(100, strokes.length), strokes.length]) {
    for (let repeat = 0; repeat < 3; repeat += 1) {
      for (const action of ["select", "save", "reconcile", "deselect"] as const) {
        const update = world.update;
        const render = world.renderer.render;
        const ecsMs: number[] = [], renderMs: number[] = [];
        const beforeUploads = renderer.getUploadedBytes();
        world.update = function(delta, time) {
          const start = performance.now();
          try { return update.call(this, delta, time); }
          finally { ecsMs.push(performance.now() - start); }
        };
        world.renderer.render = function(scene, camera) {
          const start = performance.now();
          try { return render.call(this, scene, camera); }
          finally { renderMs.push(performance.now() - start); }
        };
        let actionCpuMs = 0;
        try {
          const start = performance.now();
          if (action === "select" || action === "deselect") {
            for (let index = 0; index < strokes.length; index += 1) strokes[index].setValue(BrushStroke, "selected", action === "select" && index < count);
          } else if (action === "save") {
            if (library.collectVisibleStrokeData().length !== strokes.length) throw new Error("[BatchInteractions] Snapshot lost strokes");
          }
          actionCpuMs = performance.now() - start;
          // Save is observed synchronously; following frames must retain
          // selection without releasing/recreating geometry or uploads.
          if (action !== "save") for (let frame = 0; frame < 6; frame += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const extracted = strokes.filter((stroke) => stroke.hasComponent(ExtractedBatchedBrushStroke)).length;
          const privateVisible = strokes.filter((stroke) => stroke.object3D?.visible).length;
          const expectedPrivate = renderer.getMetrics().enabled ? (action === "deselect" ? 0 : count) : strokes.length;
          if (privateVisible !== expectedPrivate) throw new Error(`[BatchInteractions] ${action}: private ownership ${privateVisible} != ${expectedPrivate}`);
          results.push({ count, repeat, action, actionCpuMs, ecsMs, renderMs, requestedUploadBytes: renderer.getUploadedBytes() - beforeUploads, extracted, privateVisible });
        } finally {
          world.update = update;
          world.renderer.render = render;
        }
      }
    }
  }
  return { strokes: strokes.length, enabled: renderer.getMetrics().enabled, results };
}

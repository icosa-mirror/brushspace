import type { World } from "@iwsdk/core";
import { StrokeBatchRenderSystem } from "../systems/stroke-batch-render-system.js";

let sampling = false;

/** Dev-only timing instrumentation, installed only during an explicit sample. */
export async function sampleStrokeBatchPerformance(world: World, durationMs = 30_000) {
  if (sampling) throw new Error("[StrokeBatchPerformance] Sample already active");
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 60_000) throw new Error("[StrokeBatchPerformance] Invalid duration");
  sampling = true;
  const capacity = 30_000;
  const intervals = new Float64Array(capacity);
  const ecs = new Float64Array(capacity);
  const render = new Float64Array(capacity);
  const gpu = new Float64Array(capacity);
  let intervalCount = 0;
  let ecsCount = 0;
  let renderCount = 0;
  let gpuCount = 0;
  let disjointCount = 0;
  let missedGpuSamples = 0;
  const gl = world.renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  // Sample one in 16 renders, with a bounded pool to avoid per-frame queries.
  const queries = timer ? Array.from({ length: 4 }, () => ({ query: gl.createQuery(), pending: false })) : [];
  const originalUpdate = world.update;
  const originalRender = world.renderer.render;
  const info = world.renderer.info;
  const beforeMemory = { ...info.memory };
  const batches = world.getSystem(StrokeBatchRenderSystem)!;
  const beforeUploads = batches.getUploadedBytes();
  let hidden = false;
  let lastCalls = 0;
  let lastTriangles = 0;
  world.update = function(delta, time) {
    const start = performance.now();
    try {
      return originalUpdate.call(this, delta, time);
    } finally {
      if (ecsCount < capacity) ecs[ecsCount++] = performance.now() - start;
    }
  };
  world.renderer.render = function(scene, camera) {
    let active: typeof queries[number] | undefined;
    if (timer) {
      for (const slot of queries) {
        if (!slot.pending || !gl.getQueryParameter(slot.query!, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) disjointCount += 1;
        else if (gpuCount < capacity) gpu[gpuCount++] = Number(gl.getQueryParameter(slot.query!, gl.QUERY_RESULT)) / 1e6;
        slot.pending = false;
      }
      if (renderCount % 16 === 0) {
        for (const slot of queries) {
          if (slot.query && !slot.pending) { active = slot; break; }
        }
        if (active && !gl.getQuery(timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, active.query);
        } else {
          active = undefined;
          missedGpuSamples += 1;
        }
      }
    }
    const start = performance.now();
    try {
      originalRender.call(this, scene, camera);
    } finally {
      if (renderCount < capacity) render[renderCount++] = performance.now() - start;
      if (active && timer) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        active.pending = true;
      }
      lastCalls = info.render.calls;
      lastTriangles = info.render.triangles;
    }
  };
  const started = performance.now();
  try {
    await new Promise<void>((resolve) => {
      let previous: number | undefined;
      const frame = (time: number) => {
        hidden ||= document.visibilityState !== "visible";
        if (previous !== undefined && intervalCount < capacity) intervals[intervalCount++] = time - previous;
        previous = time;
        if (performance.now() - started >= durationMs) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  } finally {
    world.update = originalUpdate;
    world.renderer.render = originalRender;
    for (const slot of queries) if (slot.query) gl.deleteQuery(slot.query);
    sampling = false;
  }
  return {
    durationMs: performance.now() - started,
    hidden,
    overflow: intervalCount === capacity || ecsCount === capacity || renderCount === capacity,
    gpuTimerSupported: Boolean(timer),
    gpuSamplingStride: 16,
    disjointCount,
    missedGpuSamples,
    calls: lastCalls,
    triangles: lastTriangles,
    beforeMemory,
    afterMemory: { ...info.memory },
    beforeUploads,
    afterUploads: batches.getUploadedBytes(),
    intervalsMs: Array.from(intervals.subarray(0, intervalCount)),
    ecsCpuMs: Array.from(ecs.subarray(0, ecsCount)),
    renderCpuMs: Array.from(render.subarray(0, renderCount)),
    gpuRenderMs: Array.from(gpu.subarray(0, gpuCount)),
  };
}

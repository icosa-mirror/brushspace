import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";

const baseUrl = process.argv[2];
const output = process.argv[3];
if (!baseUrl || !output) throw new Error("Usage: node scripts/browser-batching-performance.mjs <runtime-url> <output-directory>");
await mkdir(output, { recursive: true });
const order = [false, true, true, false, false, true];
const budgets = {
  status: "diagnostic candidates, not default-on acceptance",
  cpuGpuP95: "allow max(0.2 ms, 10% of reference median, reference run spread)",
  frameIntervalP95: "allow max(1 ms, 10% of reference median, reference run spread)",
  longIntervalRate: "interval > 1.5x pooled reference median cadence; allow max(1 percentage point, reference run spread)",
  imageRms: "allow max(0.1 RGB byte levels, 2x maximum reference repeat RMS); blue coverage within 1% of reference",
};
const files = ["package-lock.json", "src/app/stroke-batch-validation.ts", "src/app/stroke-batch-performance-validation.ts", "scripts/browser-batching-performance.mjs"];
const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, createHash("sha256").update(await readFile(file)).digest("hex")])));
await writeFile(path.join(output, "protocol.json"), JSON.stringify({
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  hashes, order, durationMs: 30000, warmupMs: 5000, postCaptureSettlingMs: 5000, viewport: [1280, 720], deviceScaleFactor: 1,
  workload: "Flat-only controlled, 200 strokes", budgets,
}, null, 2));
const percentile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const stats = (values) => ({ count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99) });
// Own a fresh visible temporary profile; never attach to an existing browser.
const browser = await chromium.launch({ channel: "chrome", headless: false });
const runs = [];
try {
  for (const [index, enabled] of order.entries()) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (/GL_INVALID|GL_INVALID_OPERATION/.test(message.text())) errors.push(message.text()); });
    const shadersReady = page.waitForEvent("console", {
      predicate: (message) => /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(message.text()), timeout: 120_000,
    });
    const url = new URL(baseUrl);
    url.searchParams.set("batch-validation", "flat");
    url.searchParams.set("strokeBatches", enabled ? "1" : "0");
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.strokeBatchValidation === "ready", undefined, { timeout: 120_000 });
    const counts = (await shadersReady).text().match(/ready: (\d+)\/(\d+)/);
    if (counts[1] !== counts[2]) throw new Error("Incomplete shader loading");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(output, `run-${index + 1}-before.png`) });
    await page.waitForTimeout(5000);
    const environment = await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl2");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return { gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        metrics: Object.fromEntries(Object.entries(document.documentElement.dataset).filter(([key]) => key.startsWith("strokeBatch"))) };
    });
    if (!environment.gpu || /swiftshader|llvmpipe|software/i.test(environment.gpu)) throw new Error("Hardware GPU required");
    if (enabled && Number(environment.metrics.strokeBatchCompatibleStrokes) !== 200) throw new Error("Unexpected batching workload");
    console.log(`Sampling run ${index + 1}/6: ${enabled ? "batched" : "reference"}`);
    const samples = await page.evaluate(() => window.sampleStrokeBatchPerformance());
    await page.screenshot({ path: path.join(output, `run-${index + 1}-after.png`) });
    const run = { index: index + 1, enabled, browser: browser.version(), environment, errors, ...samples };
    await writeFile(path.join(output, `run-${index + 1}-${enabled ? "batched" : "reference"}.json`), JSON.stringify(run));
    if (errors.length || samples.hidden || samples.overflow) throw new Error(`Run ${index + 1} invalid; see raw evidence`);
    if (samples.calls !== Number(environment.metrics.strokeBatchRendererCalls)
      || samples.triangles !== Number(environment.metrics.strokeBatchRendererTriangles)
      || samples.beforeUploads !== samples.afterUploads) throw new Error(`Run ${index + 1} workload changed during sampling`);
    runs.push(run);
    await page.close();
  }
} finally {
  await browser.close();
}
const cadenceMs = percentile(runs.filter((run) => !run.enabled).flatMap((run) => run.intervalsMs), 0.5);
const summaries = runs.map((run) => ({
  index: run.index, enabled: run.enabled, calls: run.calls, triangles: run.triangles,
  interval: stats(run.intervalsMs), ecs: stats(run.ecsCpuMs), render: stats(run.renderCpuMs), gpu: stats(run.gpuRenderMs),
  longIntervalPercent: 100 * run.intervalsMs.filter((interval) => interval > cadenceMs * 1.5).length / run.intervalsMs.length,
  gpuTimerSupported: run.gpuTimerSupported, disjointCount: run.disjointCount, missedGpuSamples: run.missedGpuSamples,
  beforeMemory: run.beforeMemory, afterMemory: run.afterMemory,
  beforeUploads: run.beforeUploads, afterUploads: run.afterUploads,
}));
const comparisons = ["ecs", "render", "gpu", "interval", "longIntervalPercent"].map((metric) => {
  const values = (enabled) => summaries.filter((run) => run.enabled === enabled).map((run) => metric === "longIntervalPercent" ? run[metric] : run[metric].p95).filter((value) => value !== null);
  const reference = values(false);
  const batched = values(true);
  if (reference.length !== 3 || batched.length !== 3) return { metric, status: "insufficient samples" };
  const baseline = percentile(reference, 0.5);
  const spread = Math.max(...reference) - Math.min(...reference);
  const allowance = Math.max(metric === "longIntervalPercent" || metric === "interval" ? 1 : 0.2, metric === "longIntervalPercent" ? 0 : baseline * 0.1, spread);
  return { metric, referenceMedian: baseline, batchedMedian: percentile(batched, 0.5), allowance,
    runsOverDiagnosticBudget: batched.filter((value) => value > baseline + allowance).length };
});
const summary = { cadenceMs, cadenceNote: "Observed reference browser cadence, not measured display/headset refresh", budgets, summaries, comparisons };
await writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ cadenceMs, comparisons }));
// Image processing happens only after all timing runs, avoiding CPU contention.
const golden = await sharp(path.join(output, "run-1-after.png")).removeAlpha().raw().toBuffer();
const images = [];
for (const run of runs) {
  for (const stage of ["before", "after"]) {
    const pixels = await sharp(path.join(output, `run-${run.index}-${stage}.png`)).removeAlpha().raw().toBuffer();
    if (pixels.length !== golden.length) throw new Error("Screenshot dimensions changed");
    let squaredError = 0;
    let changedChannels = 0;
    let bluePixels = 0;
    for (let index = 0; index < pixels.length; index += 1) {
      const difference = pixels[index] - golden[index];
      squaredError += difference * difference;
      if (difference) changedChannels += 1;
      if (index % 3 === 0 && pixels[index + 2] > 60 && pixels[index + 2] > pixels[index] * 1.5 && pixels[index + 2] > pixels[index + 1] * 1.2) bluePixels += 1;
    }
    images.push({ run: run.index, enabled: run.enabled, stage, bluePixels, changedChannels, rms: Math.sqrt(squaredError / pixels.length) });
  }
}
const referenceBlue = images.find((entry) => entry.run === 1 && entry.stage === "after").bluePixels;
const rmsAllowance = Math.max(0.1, 2 * Math.max(...images.filter((entry) => !entry.enabled).map((entry) => entry.rms)));
await writeFile(path.join(output, "image-comparison.json"), JSON.stringify({ referenceBlue, rmsAllowance, images }, null, 2));
if (referenceBlue < 1000 || images.some((entry) => Math.abs(entry.bluePixels / referenceBlue - 1) > 0.01 || entry.rms > rmsAllowance)) throw new Error("Timed workload screenshot mismatch; inspect image-comparison.json");
console.log(`Matched ${images.length} timing screenshots; RMS allowance ${rmsAllowance}`);

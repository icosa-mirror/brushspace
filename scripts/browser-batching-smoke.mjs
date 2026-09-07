import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const baseUrl = process.argv[2] ?? "http://localhost:8081/";
const output = process.argv[3];
if (!output) throw new Error("Usage: node scripts/browser-batching-smoke.mjs <runtime-url> <output-directory>");
await mkdir(output, { recursive: true });
// Playwright owns this temporary profile. Do not attach to a user's browser.
const browser = await chromium.launch({ channel: "chrome", headless: false });
const results = [];
try {
  for (const enabled of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || /GL_INVALID|GL_INVALID_OPERATION/.test(message.text())) consoleErrors.push(message.text());
    });
    const shadersReady = page.waitForEvent("console", {
      predicate: (message) => /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(message.text()),
      timeout: 120_000,
    });
    const url = new URL(baseUrl);
    url.searchParams.set("batch-validation", "flat");
    url.searchParams.set("strokeBatches", enabled ? "1" : "0");
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.strokeBatchValidation === "ready", undefined, { timeout: 120_000 });
    const readyCounts = (await shadersReady).text().match(/ready: (\d+)\/(\d+)/);
    if (!readyCounts || readyCounts[1] !== readyCounts[2]) throw new Error("Incomplete managed shader loading");
    await page.waitForTimeout(5000);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const gl = canvas?.getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        metrics: Object.fromEntries(Object.entries(document.documentElement.dataset).filter(([key]) => key.startsWith("strokeBatch"))),
      };
    });
    if (!result.renderer || /swiftshader|llvmpipe|software/i.test(result.renderer)) {
      throw new Error(`Hardware renderer required, got ${result.renderer}`);
    }
    await writeFile(path.join(output, enabled ? "batched-diagnostics.json" : "reference-diagnostics.json"), JSON.stringify({ ...result, errors, consoleErrors }, null, 2));
    if (errors.length) throw new Error(`Page errors recorded in ${output}`);
    if (enabled && Number(result.metrics.strokeBatchCompatibleStrokes) !== 200) {
      throw new Error(`Expected 200 batched strokes: ${JSON.stringify(result.metrics)}`);
    }
    await page.screenshot({ path: path.join(output, enabled ? "batched.png" : "reference.png") });
    results.push({ enabled, ...result });
    await page.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ browser: browser.version(), results }, null, 2));
  console.log(JSON.stringify(results.map(({ enabled, renderer, metrics }) => ({ enabled, renderer, calls: metrics.strokeBatchRendererCalls, triangles: metrics.strokeBatchRendererTriangles, batches: metrics.strokeBatchCount, eligible: metrics.strokeBatchCompatibleStrokes }))));
  // Gross visibility gate for this blue Flat workload, not a fidelity metric.
  const coverage = [];
  const pixels = [];
  for (const file of ["reference.png", "batched.png"]) {
    const { data, info } = await sharp(path.join(output, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let bluePixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (data[offset + 2] > 60 && data[offset + 2] > data[offset] * 1.5 && data[offset + 2] > data[offset + 1] * 1.2) bluePixels += 1;
    }
    coverage.push(bluePixels);
    pixels.push(data);
  }
  let changedChannels = 0;
  let squaredError = 0;
  for (let index = 0; index < pixels[0].length; index += 1) {
    const difference = pixels[0][index] - pixels[1][index];
    if (difference !== 0) changedChannels += 1;
    squaredError += difference * difference;
  }
  const comparison = { reference: coverage[0], batched: coverage[1], changedChannels, rms: Math.sqrt(squaredError / pixels[0].length) };
  await writeFile(path.join(output, "coverage.json"), JSON.stringify(comparison));
  console.log(JSON.stringify(comparison));
  if (coverage[0] < 1000 || coverage[1] < coverage[0] * 0.9) {
    throw new Error(`Flat visibility gate failed: reference=${coverage[0]}, batched=${coverage[1]}`);
  }
} finally {
  await browser.close();
}

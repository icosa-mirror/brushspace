import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2];
const output = process.argv[3];
const inspectOnly = process.argv.includes("--inspect");
if (!baseUrl || !output) throw new Error("Usage: node scripts/browser-gallery-batching.mjs <runtime-url> <output-directory>");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false });
let chosen;
try {
  for (const enabled of inspectOnly ? [true] : process.argv.includes("--reverse") ? [true, false] : [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (errors.length < 20 && /GL_INVALID|GL_INVALID_OPERATION|Error:|WebGL.*error/i.test(message.text())) errors.push(message.text());
    });
    const shadersReady = page.waitForEvent("console", {
      predicate: (message) => /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(message.text()), timeout: 120000,
    });
    // Preserve an earlier load failure instead of masking it with shutdown's
    // rejection of an outstanding shader-ready wait.
    void shadersReady.catch(() => undefined);
    const url = new URL(baseUrl);
    url.searchParams.set("batch-validation", "gallery");
    url.searchParams.set("strokeBatches", enabled ? "1" : "0");
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.galleryBatchValidation?.entries().some((entry) => entry.tiltUrl), undefined, { timeout: 120000 });
    const firstPage = await page.evaluate(() => window.galleryBatchValidation.entries());
    chosen ??= firstPage.find((entry) => entry.tiltUrl);
    if (!firstPage.some((entry) => entry.id === chosen.id)) throw new Error("Selected sketch is no longer on first gallery page");
    await writeFile(path.join(output, "gallery-selection.json"), JSON.stringify({ firstPage, chosen }, null, 2));
    console.log(`Opening first-page gallery entry (${enabled ? "batched" : "reference"}): ${chosen.name}`);
    const start = performance.now();
    if (!await page.evaluate((id) => window.galleryBatchValidation.open(id), chosen.id)) throw new Error("Gallery refused open");
    await page.waitForFunction(() => {
      const state = window.galleryBatchValidation.inspect();
      return !state.busy && (state.status === "loaded" || state.status === "load-failed");
    }, undefined, { timeout: 180000, polling: 500 });
    const loadMs = performance.now() - start;
    const loaded = await page.evaluate(() => window.galleryBatchValidation.inspect());
    if (loaded.status !== "loaded") throw new Error(`Gallery load failed: ${loaded.error}`);
    const shaderCounts = (await shadersReady).text().match(/ready: (\d+)\/(\d+)/);
    if (shaderCounts[1] !== shaderCounts[2]) throw new Error("Incomplete managed shader loading");
    const camera = await page.evaluate(() => window.galleryBatchValidation.frame());
    await page.waitForTimeout(5000);
    const state = await page.evaluate(() => window.galleryBatchValidation.inspect());
    const diagnostics = await page.evaluate(() => window.galleryBatchValidation.diagnostics());
    await writeFile(path.join(output, enabled ? "batched-state.json" : "reference-state.json"), JSON.stringify({ state, camera, errors, diagnostics }));
    await page.screenshot({ path: path.join(output, enabled ? "batched.png" : "reference.png") });
    if (process.argv.includes("--xr")) {
      await page.locator("#enter-vr-button").click();
      await page.waitForFunction(() => window.galleryBatchValidation.xrStatus().presenting, undefined, { timeout: 15000 });
      await page.waitForTimeout(3000);
      const xr = await page.evaluate(() => window.galleryBatchValidation.xrStatus());
      await writeFile(path.join(output, "xr.json"), JSON.stringify({ xr, errors }));
      if (xr.views !== 2 || errors.length) throw new Error("XR stereo rendering validation failed");
      await page.screenshot({ path: path.join(output, "xr.png") });
      await page.evaluate(() => window.galleryBatchValidation.endXR());
      await page.waitForFunction(() => !window.galleryBatchValidation.xrStatus().presenting);
      console.log(JSON.stringify({ xr }));
    }
    if (process.argv.includes("--lifecycle")) {
      if (!enabled) throw new Error("Lifecycle checks require --inspect (batched-only)");
      const lifecycle = await page.evaluate(() => window.galleryBatchValidation.lifecycle());
      await writeFile(path.join(output, "lifecycle.json"), JSON.stringify(lifecycle));
      console.log(JSON.stringify({ brushesChecked: lifecycle.brushesChecked, layersChecked: lifecycle.layersChecked }));
    }
    if (inspectOnly) {
      console.log(JSON.stringify({ state: state.metrics, errors }));
      await page.close();
      continue;
    }
    await page.waitForTimeout(5000);
    const sample = await page.evaluate(() => window.galleryBatchValidation.sample());
    const gpu = await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl2");
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null;
    });
    await writeFile(path.join(output, enabled ? "batched.json" : "reference.json"), JSON.stringify({ chosen, browser: browser.version(), gpu, loadMs, camera, state, errors, sample }));
    if (errors.length || sample.hidden || !gpu || /swiftshader|software|llvmpipe/i.test(gpu)) throw new Error("Invalid runtime; inspect recorded evidence");
    const total = state.brushes.reduce((sum, brush) => sum + brush.strokes, 0);
    const batched = state.brushes.reduce((sum, brush) => sum + brush.batched, 0);
    console.log(JSON.stringify({ enabled, strokes: total, batched, calls: sample.calls, triangles: sample.triangles, topBrushes: state.brushes.slice(0, 5).map(({ name, strokes }) => ({ name, strokes })) }));
    await page.close();
  }
} catch (error) {
  console.error("[GalleryBatchValidation]", error);
  throw error;
} finally {
  await browser.close();
}

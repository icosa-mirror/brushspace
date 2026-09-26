import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [baseUrl, output] = process.argv.slice(2);
if (!baseUrl || !output) throw new Error("Usage: node scripts/browser-gallery-transitions.mjs <runtime-url> <output-directory>");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false });
const check = (condition, message) => { if (!condition) throw new Error(`[GalleryTransitions] ${message}`); };
let chosen;
try {
  for (const enabled of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (errors.length < 20 && /GL_INVALID|Error:|WebGL.*error/i.test(message.text())) errors.push(message.text());
    });
    const ready = page.waitForEvent("console", { predicate: (message) => /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(message.text()), timeout: 120000 });
    void ready.catch(() => undefined);
    const url = new URL(baseUrl);
    url.searchParams.set("batch-validation", "gallery");
    url.searchParams.set("strokeBatches", enabled ? "1" : "0");
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.galleryBatchValidation?.entries().some((entry) => entry.tiltUrl), undefined, { timeout: 120000 });
    const counts = (await ready).text().match(/ready: (\d+)\/(\d+)/);
    check(counts && counts[1] === counts[2], "Incomplete managed materials");
    const entries = await page.evaluate(() => window.galleryBatchValidation.entries());
    chosen ??= entries.find((entry) => entry.tiltUrl);
    check(entries.some((entry) => entry.id === chosen.id), "Sketch missing from first page");
    const gpu = await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl2");
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    });
    check(gpu && !/swiftshader|software|llvmpipe/i.test(gpu), "Hardware renderer required");
    const cycles = [];
    const open = async () => page.evaluate(async (id) => {
      const api = window.galleryBatchValidation;
      if (!api.open(id)) throw new Error("[GalleryTransitions] Open refused");
      const frames = [];
      const start = performance.now();
      do {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const state = api.resources();
        const previous = frames.at(-1);
        // Retain changes only; a slow download must not generate a huge trace.
        if (!previous || ["strokes", "visible", "privateVisible", "batchMeshes", "batchTriangles", "busy"].some((key) => state[key] !== previous[key])) frames.push({ ...state, ms: performance.now() - start });
        if (performance.now() - start > 180000) throw new Error("[GalleryTransitions] Open timed out");
      } while (api.resources().busy);
      return { frames, status: api.inspect().status };
    }, chosen.id);
    const resources = () => page.evaluate(() => window.galleryBatchValidation.resources());
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const trace = await open();
      await writeFile(path.join(output, `${enabled ? "batched" : "reference"}-reveal-${cycle}.json`), JSON.stringify(trace, null, 2));
      check(trace.status === "loaded", "Gallery load failed");
      await page.evaluate(() => window.galleryBatchValidation.frame());
      await page.waitForTimeout(2000);
      const loaded = await resources();
      check(loaded.strokes > 0 && loaded.visible === loaded.strokes, "Load did not reveal all strokes");
      check(trace.frames.some((state) => state.visible > 0 && state.visible < loaded.strokes), "No progressive reveal observed");
      check(trace.frames.every((state, index) => index === 0 || state.visible >= trace.frames[index - 1].visible), "Reveal visibility went backwards");
      for (const state of trace.frames) {
        check(state.privateVisible === (enabled ? 0 : state.visible), "Transition rendering ownership mismatch");
        if (state.visible === 0) check(state.batchTriangles === 0, "Hidden strokes retain shared triangles");
      }
      check(enabled ? loaded.batchMeshes > 0 && loaded.batchTriangles > 0 : loaded.batchMeshes === 0, "Wrong batch ownership after load");
      const selection = await page.evaluate(() => window.galleryBatchValidation.selectFirst());
      const selected = await resources();
      check(selection.extracted === enabled && selected.privateVisible === (enabled ? 1 : selected.visible), "Selection extraction failed");
      await page.evaluate(() => window.galleryBatchValidation.clear());
      await page.waitForTimeout(1000);
      const cleared = await resources();
      await writeFile(path.join(output, `${enabled ? "batched" : "reference"}-cycle-${cycle}.json`), JSON.stringify({ loaded, selection, selected, cleared }, null, 2));
      check(cleared.strokes === 0 && cleared.batchMeshes === 0 && cleared.extracted === 0 && cleared.privateVisible === 0, "Clear retained stroke render owners");
      check(cleared.selectedGeometryDisposals === 1, "Clear did not dispose selected private geometry exactly once");
      if (cycle > 0) {
        // The first selection lazily creates a persistent widget geometry.
        // Compare the same selected/cleared stages, and later warmed loads.
        if (cycle > 1) check(loaded.geometries <= cycles[1].loaded.geometries, "Warmed loaded geometry count grew across cycles");
        check(selected.geometries <= cycles[0].selected.geometries, "Selected geometry count grew across cycles");
        check(cleared.geometries <= cycles[0].cleared.geometries, "Cleared geometry count grew across cycles");
        check(cleared.textures <= cycles[0].cleared.textures, "Texture count grew across cycles");
      }
      cycles.push({ cycle, trace, loaded, selected, cleared });
      await writeFile(path.join(output, enabled ? "batched.json" : "reference.json"), JSON.stringify({ chosen, enabled, browser: browser.version(), gpu, errors, cycles }, null, 2));
    }
    // Reopen without an immediate clear to exercise the outgoing transition too.
    await open();
    const replacement = await open();
    await writeFile(path.join(output, `${enabled ? "batched" : "reference"}-replacement.json`), JSON.stringify(replacement, null, 2));
    check(replacement.frames.some((state) => state.visible > 0 && state.visible < cycles[0].loaded.strokes), "Replacement did not transition");
    check(replacement.frames.some((state, index) => index > 0 && state.visible < replacement.frames[index - 1].visible), "No outgoing hide observed");
    check(replacement.frames.some((state, index) => index > 0 && state.visible > replacement.frames[index - 1].visible), "No incoming reveal observed");
    for (const state of replacement.frames) check(state.privateVisible === (enabled ? 0 : state.visible), "Replacement ownership mismatch");
    const final = await resources();
    check(final.strokes === cycles[0].loaded.strokes && final.visible === final.strokes, "Replacement duplicated or lost logical strokes");
    check(errors.length === 0, "Runtime errors recorded");
    await writeFile(path.join(output, enabled ? "batched.json" : "reference.json"), JSON.stringify({ chosen, enabled, browser: browser.version(), gpu, errors, cycles, replacement, final }, null, 2));
    console.log(JSON.stringify({ enabled, strokes: final.strokes, cycles: cycles.length, geometriesLoaded: cycles.map((cycle) => cycle.loaded.geometries), geometriesCleared: cycles.map((cycle) => cycle.cleared.geometries) }));
    await page.close();
  }
} finally {
  await browser.close();
}

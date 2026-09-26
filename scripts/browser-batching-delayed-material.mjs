import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [baseUrl, output] = process.argv.slice(2);
if (!baseUrl || !output) throw new Error("Usage: node scripts/browser-batching-delayed-material.mjs <runtime-url> <output-directory>");
await mkdir(output, { recursive: true });
const check = (condition, message) => { if (!condition) throw new Error(`[DelayedMaterialValidation] ${message}`); };
const browser = await chromium.launch({ channel: "chrome", headless: false });
try {
  for (const enabled of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const heldUrls = [];
    await page.route(/\/Flat-2d35bcf0-e4d8-452c-97b1-3311be063130\/.*\.glsl/, async (route) => {
      heldUrls.push(route.request().url());
      await gate;
      await route.continue();
    });
    const url = new URL(baseUrl);
    url.searchParams.set("batch-validation", "delayed");
    url.searchParams.set("strokeBatches", enabled ? "1" : "0");
    const ready = page.waitForEvent("console", { predicate: (message) => /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(message.text()), timeout: 180000 });
    void ready.catch(() => undefined);
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.strokeBatchDelayedMaterial, undefined, { timeout: 120000 });
    // Deliberately interact before startup assets finish. The development
    // workload exposes the canvas by making only the loading overlay inert.
    const baseline = await page.evaluate(() => {
      const overlay = document.getElementById("loading-screen");
      if (overlay) overlay.style.pointerEvents = "none";
      return window.inspectStrokeBatchHistory(true);
    });
    const inspect = () => page.evaluate(() => window.inspectStrokeBatchHistory());
    const key = async (value) => { await page.keyboard.press(value); await page.waitForTimeout(300); };
    const click = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(300); };
    await page.mouse.move(560, 380);
    await page.mouse.down();
    for (let x = 570; x <= 730; x += 10) { await page.mouse.move(x, 380); await page.waitForTimeout(30); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const drawn = await inspect();
    const target = drawn.strokes.find((stroke) => !baseline.strokes.some((old) => old.guid === stroke.guid));
    check(target?.finalized && target.visible && target.privateVisible && !target.batched, "Finalized stroke did not retain private fallback ownership");
    check(heldUrls.length > 0, "No real shader request held");
    await page.evaluate(() => window.inspectStrokeBatchHistory("eraser"));
    await click(900, 550);
    const miss = await inspect();
    check(miss.undoDepth === drawn.undoDepth, "Fallback erase miss changed history");
    await click(640, 380);
    const erased = await inspect();
    check(!erased.strokes.find((stroke) => stroke.guid === target.guid)?.visible && erased.undoDepth === drawn.undoDepth + 1, "Fallback erase failed");
    await key("z");
    const restored = await inspect();
    check(restored.strokes.find((stroke) => stroke.guid === target.guid)?.privateVisible, "Fallback erase undo did not restore private geometry");
    await key("y");
    await click(640, 380);
    const hidden = await inspect();
    check(hidden.undoDepth === erased.undoDepth, "Hidden fallback erased again");
    const pickerBefore = await page.evaluate(() => window.inspectStrokeBatchHistory("dropper"));
    await click(640, 380);
    const hiddenPick = await inspect();
    check(hiddenPick.activeTool === "dropper", "Picker hit hidden fallback");
    await key("z");
    await click(640, 380);
    const picked = await inspect();
    check(picked.activeTool === "free-paint" && picked.settings.brushGuid === target.brushGuid, "Picker missed visible fallback");
    check(Math.abs(picked.settings.size - target.size) < 1e-6 && picked.settings.color.every((value, index) => Math.abs(value - target.color[index]) < 1e-6), "Fallback picker changed brush parameters");
    const tools = { baseline, drawn, miss, erased, restored, hidden, pickerBefore, hiddenPick, picked };
    await writeFile(path.join(output, `${enabled ? "batched" : "reference"}-tools.json`), JSON.stringify(tools, null, 2));
    await page.evaluate(() => window.strokeBatchDelayedMaterial.clear());
    const cleared = await inspect();
    check(cleared.strokes.length === 0, "Clear retained pending strokes");
    await page.evaluate(({ guid }) => {
      window.strokeBatchDelayedMaterial.spawn(guid, 0.25, false);
      window.strokeBatchDelayedMaterial.spawn("delayed-selected", 0, true);
    }, { guid: target.guid });
    const selected = await page.evaluate(() => window.manipulateStrokeBatchSelection("delayed-selected", "select"));
    check(selected.strokes.length === 2 && selected.strokes.every((stroke) => !stroke.batched), "Replacement pending ownership incorrect");
    await page.evaluate(() => window.manipulateStrokeBatchSelection("delayed-selected", "move", 0.1));
    const beforeArrival = await page.evaluate(() => window.manipulateStrokeBatchSelection("delayed-selected", "save"));
    release();
    const counts = (await ready).text().match(/ready: (\d+)\/(\d+)/);
    check(counts && counts[1] === counts[2], "Incomplete material arrival");
    await page.waitForTimeout(1500);
    const arrived = await inspect();
    check(arrived.strokes.length === 2 && arrived.strokes.every((stroke) => stroke.batched === enabled), "Delayed commit resurrected or lost strokes");
    const replacement = arrived.strokes.find((stroke) => stroke.guid === target.guid);
    const selectedArrival = arrived.strokes.find((stroke) => stroke.guid === "delayed-selected");
    check(!replacement.visible && !replacement.privateVisible, "Arrival revealed hidden replacement");
    check(Math.abs(replacement.serializedX - 0.05) < 1e-6, "Stale pending geometry replaced new points for reused GUID");
    check(selectedArrival.selected && selectedArrival.privateVisible && selectedArrival.extracted === enabled, "Arrival lost selected private ownership");
    const afterArrival = await page.evaluate(() => window.manipulateStrokeBatchSelection("delayed-selected", "save"));
    await writeFile(path.join(output, `${enabled ? "batched" : "reference"}-arrival.json`), JSON.stringify({ beforeArrival, arrived, afterArrival }, null, 2));
    check(Math.abs(afterArrival.savedX - beforeArrival.savedX) < 1e-6, "Material arrival lost or duplicated selected movement");
    const deselected = await page.evaluate(() => window.manipulateStrokeBatchSelection("delayed-selected", "deselect"));
    check(deselected.strokes.find((stroke) => stroke.guid === "delayed-selected")?.privateVisible === !enabled, "Arrival/deselection retained wrong rendering owner");
    check(errors.length === 0, "Runtime errors recorded");
    const gpu = await page.evaluate(() => { const gl = document.querySelector("canvas").getContext("webgl2"); const ext = gl.getExtension("WEBGL_debug_renderer_info"); return ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); });
    check(gpu && !/swiftshader|software|llvmpipe/i.test(gpu), "Hardware renderer required");
    await writeFile(path.join(output, `${enabled ? "batched" : "reference"}.json`), JSON.stringify({ browser: browser.version(), gpu, enabled, heldUrls, errors, tools, cleared, selected, beforeArrival, arrived, afterArrival, deselected }, null, 2));
    console.log(JSON.stringify({ enabled, heldRequests: heldUrls.length, strokesAfterArrival: arrived.strokes.length, savedMovementPreserved: true }));
    await page.evaluate(() => window.manipulateStrokeBatchSelection("delayed-selected", "select"));
    await page.evaluate(() => window.strokeBatchPersistence.save());
    await page.waitForFunction(() => {
      const state = window.inspectStrokeBatchHistory().persistence;
      return state.status === "saved" && !state.busy;
    });
    const saved = await inspect();
    check(saved.persistence.id && saved.persistence.bytes > 0, "Persistence did not write tilt bytes");
    const savedId = saved.persistence.id;
    // Reload destroys runtime state; this must load the actual browser store.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((id) => window.strokeBatchPersistence?.entries().some((entry) => entry.id === id), savedId, { timeout: 120000 });
    check(await page.evaluate((id) => window.strokeBatchPersistence.open(id), savedId), "Saved entry could not open after reload");
    await page.waitForFunction(() => {
      const state = window.inspectStrokeBatchHistory().persistence;
      return state.status === "loaded" && !state.busy;
    });
    await page.waitForTimeout(1500);
    const reloaded = await inspect();
    check(reloaded.strokes.length === 1 && reloaded.strokes[0].visible, "Persistence reloaded hidden or duplicate strokes");
    check(Math.abs(reloaded.strokes[0].serializedX - beforeArrival.savedX) < 1e-6, "IndexedDB reload lost selected movement");
    const databases = await page.evaluate(() => indexedDB.databases());
    check(databases.length > 0, "No IndexedDB persistence database");
    await writeFile(path.join(output, `${enabled ? "batched" : "reference"}-persistence.json`), JSON.stringify({ saved, reloaded, databases }, null, 2));
    console.log(JSON.stringify({ enabled, persistedAfterPageReload: true, savedStrokes: reloaded.strokes.length }));
    await page.close();
  }
} finally {
  await browser.close();
}

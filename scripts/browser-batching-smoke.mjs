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
const transformed = process.argv.includes("--transformed");
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
    const canvasPose = transformed ? await page.evaluate(() => window.transformStrokeBatchCanvas()) : { scale: 1 };
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
    const lifecycle = await page.evaluate(async () => {
      if (!window.exerciseStrokeBatchLifecycle) throw new Error("Lifecycle driver unavailable");
      return window.exerciseStrokeBatchLifecycle();
    });
    await writeFile(path.join(output, enabled ? "batched-lifecycle.json" : "reference-lifecycle.json"), JSON.stringify(lifecycle, null, 2));
    const stages = Object.fromEntries(lifecycle.map((state) => [state.stage, state]));
    const requireState = (condition, message) => {
      if (!condition) throw new Error(`${enabled ? "batched" : "reference"} lifecycle: ${message}`);
    };
    requireState(!stages.hidden.renderVisible && !stages.hidden.privateVisible, "hidden stroke visible");
    requireState(stages.shown.renderVisible, "show did not restore visibility");
    requireState(Math.abs(stages["save-flushed"].savedX - stages.initial.serializedX - 0.15) < 1e-6, "save snapshot lost or duplicated movement");
    requireState(Math.abs(stages["save-flushed"].roundTripX - stages["save-flushed"].savedX) < 1e-6, "tilt round trip changed movement");
    if (enabled) {
      requireState(stages.initial.uploadBytes <= 326400, "bulk load uploaded more than one final Flat batch");
      requireState(!stages.hidden.batchSubsetHasTriangles && stages.shown.batchSubsetHasTriangles, "subset hide/show failed");
      requireState(!stages.selected.batchSubsetHasTriangles && stages["moved-deselected"].batchSubsetHasTriangles, "selection rendering owners overlap or fail to restore");
      requireState(stages.initial.privateVertices === 0 && !stages.initial.privateVisible, "private geometry retained after commit");
      requireState(stages.selected.extracted && stages.selected.privateVisible && stages.selected.privateVertices > 0, "selection did not extract geometry");
      requireState(stages.selected.uploadBytes === stages["selected-idle"].uploadBytes, "idle selection uploads repeatedly");
      requireState(!stages["moved-deselected"].extracted && stages["moved-deselected"].privateVertices === 0, "deselection did not reclaim geometry");
      requireState(Math.abs(stages["moved-deselected"].serializedX - stages.initial.serializedX - 0.1) < 1e-6, "movement was not baked once");
      requireState(!stages["save-flushed"].extracted && stages["selected-after-save"].extracted, "save/re-extraction transition failed");
      requireState(stages["selected-after-save"].uploadBytes === stages["after-save-idle"].uploadBytes, "idle after save uploads repeatedly");
      requireState(Math.abs(stages.final.serializedX - stages.initial.serializedX - 0.15) < 1e-6, "save/deselection duplicated movement");
    }
    if (errors.length) throw new Error(`Lifecycle page errors: ${errors[0]}`);
    results.push({ enabled, ...result });
    const inspectHistory = () => page.evaluate(() => window.inspectStrokeBatchHistory());
    const baselineHistory = await page.evaluate(() => window.inspectStrokeBatchHistory(true));
    const baselineGuids = new Set(baselineHistory.strokes.map((stroke) => stroke.guid));
    const drawStroke = async (y, provisionalTail = false) => {
      await page.mouse.move(560, y);
      await page.mouse.down();
      for (let x = 570; x <= 730; x += 10) {
        await page.mouse.move(x, y);
        await page.waitForTimeout(30);
      }
      if (provisionalTail) {
        await page.mouse.move(731, y);
        await page.waitForTimeout(40);
      }
      await page.mouse.up();
      await page.waitForTimeout(250);
    };
    const historyKey = async (key) => {
      await page.keyboard.down(key);
      await page.waitForTimeout(80);
      await page.keyboard.up(key);
      await page.waitForTimeout(250);
    };
    await drawStroke(350);
    const createdHistory = await inspectHistory();
    await writeFile(path.join(output, enabled ? "batched-history-created.json" : "reference-history-created.json"), JSON.stringify({ baselineHistory, createdHistory }, null, 2));
    const created = createdHistory.strokes.filter((stroke) => !baselineGuids.has(stroke.guid));
    requireState(created.length === 1 && created[0].finalized && created[0].visible, "browser drawing did not finalize one visible stroke");
    requireState(created[0].batched === enabled && created[0].privateVisible === !enabled, "authored stroke has wrong rendering owner");
    requireState(createdHistory.undoDepth === baselineHistory.undoDepth + 1, "creation not recorded in history");
    await historyKey("z");
    const undoneHistory = await inspectHistory();
    const undone = undoneHistory.strokes.find((stroke) => stroke.guid === created[0].guid);
    requireState(undone && !undone.visible && !undone.privateVisible && undoneHistory.redoDepth === 1, "undo did not hide stroke and retain redo");
    await historyKey("y");
    const redoneHistory = await inspectHistory();
    requireState(redoneHistory.strokes.find((stroke) => stroke.guid === created[0].guid)?.visible && redoneHistory.redoDepth === 0, "redo did not restore stroke");
    if (enabled) {
      requireState(createdHistory.batchTriangles > baselineHistory.batchTriangles, "finalization added no batch triangles");
      requireState(undoneHistory.batchTriangles === baselineHistory.batchTriangles, "undo left batch triangles visible");
      requireState(redoneHistory.batchTriangles === createdHistory.batchTriangles, "redo did not restore batch triangles");
    }
    const targetGuid = created[0].guid;
    const manipulate = (action, deltaX = 0) => page.evaluate(({ guid, action, deltaX }) => window.manipulateStrokeBatchSelection(guid, action, deltaX), { guid: targetGuid, action, deltaX });
    const target = (state) => state.strokes.find((stroke) => stroke.guid === targetGuid);
    const selectedMove = await manipulate("select");
    requireState(target(selectedMove).selected && target(selectedMove).extracted === enabled && target(selectedMove).privateVisible, "selection did not establish private ownership");
    const movedSelection = await manipulate("move", 0.1);
    requireState(Math.abs(target(movedSelection).objectX - target(selectedMove).objectX - 0.1) < 1e-6, "widget did not move selected stroke");
    const movedSnapshot = await manipulate("save");
    const movedSnapshotAgain = await manipulate("save");
    requireState(Math.abs(movedSnapshot.savedX - target(selectedMove).serializedX - 0.1) < 1e-6, "widget movement lost or duplicated in save");
    requireState(Math.abs(movedSnapshot.roundTripX - movedSnapshot.savedX) < 1e-6 && Math.abs(movedSnapshotAgain.savedX - movedSnapshot.savedX) < 1e-6, "repeated save changed moved points");
    await historyKey("z");
    const movedUndo = await inspectHistory();
    requireState(!target(movedUndo).visible && !target(movedUndo).privateVisible, "undo creation left selected moved geometry visible");
    if (enabled) requireState(movedUndo.batchTriangles === baselineHistory.batchTriangles, "undo selected creation left batch triangles");
    await historyKey("y");
    const movedRedo = await inspectHistory();
    requireState(target(movedRedo).visible, "redo creation lost moved stroke");
    const restoredSnapshot = await manipulate("save");
    requireState(Math.abs(restoredSnapshot.savedX - movedSnapshot.savedX) < 1e-6, "redo changed saved movement");
    const deselectedMove = await manipulate("deselect");
    requireState(!target(deselectedMove).extracted && target(deselectedMove).privateVisible === !enabled, "deselection did not restore rendering ownership");
    if (enabled) requireState(deselectedMove.batchTriangles === createdHistory.batchTriangles, "deselection changed restored triangles");
    await writeFile(path.join(output, enabled ? "batched-widget-history.json" : "reference-widget-history.json"), JSON.stringify({ selectedMove, movedSelection, movedSnapshot, movedSnapshotAgain, movedUndo, movedRedo, restoredSnapshot, deselectedMove }, null, 2));
    await historyKey("z");
    await drawStroke(380);
    const replacedHistory = await inspectHistory();
    requireState(!replacedHistory.strokes.some((stroke) => stroke.guid === created[0].guid) && replacedHistory.redoDepth === 0, "new creation did not dispose abandoned redo stroke");
    await writeFile(path.join(output, enabled ? "batched-history.json" : "reference-history.json"), JSON.stringify({ baselineHistory, createdHistory, undoneHistory, redoneHistory, replacedHistory }, null, 2));
    const eraseTarget = replacedHistory.strokes.find((stroke) => !baselineGuids.has(stroke.guid));
    requireState(eraseTarget?.visible, "replacement stroke missing before eraser test");
    const extractedErase = await page.evaluate((guid) => window.manipulateStrokeBatchSelection(guid, "select"), eraseTarget.guid);
    requireState(extractedErase.strokes.find((stroke) => stroke.guid === eraseTarget.guid)?.extracted === enabled, "erase target was not extracted");
    await page.evaluate(() => window.inspectStrokeBatchHistory("eraser"));
    const eraseClick = async (x, y) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
      await page.waitForTimeout(250);
    };
    // A miss must not create an erase-history entry or change geometry.
    await eraseClick(900, 550);
    const missedErase = await inspectHistory();
    requireState(missedErase.undoDepth === replacedHistory.undoDepth && missedErase.strokes.find((stroke) => stroke.guid === eraseTarget.guid)?.visible, "eraser miss changed history or hid target");
    await eraseClick(640, 380);
    const erasedHistory = await inspectHistory();
    await writeFile(path.join(output, enabled ? "batched-erase.json" : "reference-erase.json"), JSON.stringify({ missedErase, erasedHistory }, null, 2));
    requireState(!erasedHistory.strokes.find((stroke) => stroke.guid === eraseTarget.guid)?.visible && erasedHistory.undoDepth === replacedHistory.undoDepth + 1, "eraser did not hit target and record history");
    if (enabled) requireState(erasedHistory.batchTriangles === baselineHistory.batchTriangles, "erase left target batch triangles visible");
    await historyKey("z");
    const undoErase = await inspectHistory();
    requireState(undoErase.strokes.find((stroke) => stroke.guid === eraseTarget.guid)?.visible, "undo erase did not restore target");
    if (enabled) requireState(undoErase.batchTriangles === replacedHistory.batchTriangles, "undo erase did not restore batch triangles");
    await historyKey("y");
    const redoErase = await inspectHistory();
    requireState(!redoErase.strokes.find((stroke) => stroke.guid === eraseTarget.guid)?.visible, "redo erase did not hide target");
    // Clicking the already-hidden subset must not add another erase operation.
    await eraseClick(640, 380);
    const hiddenErase = await inspectHistory();
    requireState(hiddenErase.undoDepth === redoErase.undoDepth, "hidden subset was erased again");
    if (enabled) requireState(hiddenErase.batchTriangles === baselineHistory.batchTriangles, "hidden erase changed batch triangles");
    await writeFile(path.join(output, enabled ? "batched-erase.json" : "reference-erase.json"), JSON.stringify({ extractedErase, missedErase, erasedHistory, undoErase, redoErase, hiddenErase }, null, 2));
    const pickerBefore = await page.evaluate(() => window.inspectStrokeBatchHistory("dropper"));
    await eraseClick(640, 380);
    const pickerHidden = await inspectHistory();
    requireState(pickerHidden.activeTool === "dropper" && JSON.stringify(pickerHidden.settings) === JSON.stringify(pickerBefore.settings), "dropper picked hidden geometry");
    await historyKey("z");
    const extractedPicker = await page.evaluate((guid) => window.manipulateStrokeBatchSelection(guid, "select"), eraseTarget.guid);
    requireState(extractedPicker.strokes.find((stroke) => stroke.guid === eraseTarget.guid)?.extracted === enabled, "picker target was not extracted");
    await eraseClick(900, 550);
    const pickerMiss = await inspectHistory();
    requireState(pickerMiss.activeTool === "dropper" && JSON.stringify(pickerMiss.settings) === JSON.stringify(pickerBefore.settings), "dropper miss changed settings");
    await eraseClick(640, 380);
    const pickerHit = await inspectHistory();
    await writeFile(path.join(output, enabled ? "batched-picker.json" : "reference-picker.json"), JSON.stringify({ pickerBefore, pickerHidden, pickerMiss, pickerHit }, null, 2));
    requireState(pickerHit.activeTool === "free-paint", "dropper did not return to previous tool on hit");
    requireState(pickerHit.settings.brushGuid === eraseTarget.brushGuid, "dropper picked wrong brush");
    requireState(Math.abs(pickerHit.settings.size - eraseTarget.size * canvasPose.scale) < 1e-6, "dropper picked wrong room-space size");
    requireState(pickerHit.settings.color.every((value, index) => Math.abs(value - eraseTarget.color[index]) < 1e-6), "dropper picked wrong color");
    requireState(pickerHit.undoDepth === pickerMiss.undoDepth && pickerHit.redoDepth === pickerMiss.redoDepth, "dropper changed stroke history");
    await page.evaluate((guid) => window.manipulateStrokeBatchSelection(guid, "deselect"), eraseTarget.guid);
    await drawStroke(410);
    const afterPickerDraw = await inspectHistory();
    requireState(afterPickerDraw.undoDepth === pickerHit.undoDepth + 1 && afterPickerDraw.redoDepth === 0, "painting did not resume after releasing dropper press");
    requireState(afterPickerDraw.strokes.length === pickerHit.strokes.length + 1, "post-dropper gesture did not create a stroke");
    await writeFile(path.join(output, enabled ? "batched-picker.json" : "reference-picker.json"), JSON.stringify({ pickerBefore, pickerHidden, extractedPicker, pickerMiss, pickerHit, afterPickerDraw }, null, 2));
    await drawStroke(440, true);
    const remote = await page.evaluate(() => window.exerciseStrokeBatchRemoteLifecycle());
    await writeFile(path.join(output, enabled ? "batched-remote.json" : "reference-remote.json"), JSON.stringify(remote, null, 2));
    await page.evaluate(() => window.setStrokeBatchBrushSize(0.002));
    const beforeThin = await inspectHistory();
    await drawStroke(520);
    const afterThin = await inspectHistory();
    const thin = afterThin.strokes.find((stroke) => !beforeThin.strokes.some((old) => old.guid === stroke.guid));
    requireState(thin?.finalized && thin.visible, "Thin test stroke missing");
    await page.evaluate(() => window.inspectStrokeBatchHistory("eraser"));
    const edgeSweep = [];
    for (const offset of [0, 1, 2, 5, 10, 15, 20, 30, 50]) {
      const before = await inspectHistory();
      await eraseClick(640, 520 + offset);
      const after = await inspectHistory();
      const hit = !after.strokes.find((stroke) => stroke.guid === thin.guid)?.visible;
      edgeSweep.push({ offset, hit, historyChanged: after.undoDepth !== before.undoDepth });
      if (hit) await historyKey("z");
    }
    requireState(edgeSweep.some((entry) => entry.hit) && edgeSweep.some((entry) => !entry.hit), "Thin sweep did not cover hits and misses");
    requireState(edgeSweep.every((entry) => entry.hit === entry.historyChanged), "Thin edge decision and history disagree");
    await writeFile(path.join(output, enabled ? "batched-thin-edges.json" : "reference-thin-edges.json"), JSON.stringify({ canvasPose, thin, edgeSweep }, null, 2));
    await page.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify({ browser: browser.version(), results }, null, 2));
  const { readFile } = await import("node:fs/promises");
  const edgeDecisions = await Promise.all(["reference", "batched"].map(async (mode) => JSON.parse(await readFile(path.join(output, `${mode}-thin-edges.json`), "utf8")).edgeSweep));
  if (JSON.stringify(edgeDecisions[0]) !== JSON.stringify(edgeDecisions[1])) throw new Error("Thin geometry hit decisions differ between renderers");
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

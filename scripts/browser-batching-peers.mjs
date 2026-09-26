import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [baseUrl, output] = process.argv.slice(2);
if (!baseUrl || !output) throw new Error("Usage: node scripts/browser-batching-peers.mjs <runtime-url> <output-directory>");
await mkdir(output, { recursive: true });
const check = (condition, message) => { if (!condition) throw new Error(`[BatchingPeers] ${message}`); };
const browser = await chromium.launch({ channel: "chrome", headless: false });
try {
  for (const enabled of [false, true]) {
    const errors = [];
    const setup = async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      page.on("pageerror", (error) => errors.push(error.message));
      const ready = page.waitForEvent("console", { predicate: (message) => /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(message.text()), timeout: 120000 });
      void ready.catch(() => undefined);
      const url = new URL(baseUrl);
      url.searchParams.set("batch-validation", "delayed");
      url.searchParams.set("strokeBatches", enabled ? "1" : "0");
      await page.goto(url.href, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.strokeBatchPersistence && window.__brushspaceCollab, undefined, { timeout: 120000 });
      const counts = (await ready).text().match(/ready: (\d+)\/(\d+)/);
      check(counts && counts[1] === counts[2], "Incomplete materials");
      await page.evaluate(() => { window.__brushspaceCollab.debugEnterSketch(); window.inspectStrokeBatchHistory(true); });
      return page;
    };
    const host = await setup();
    const guest = await setup();
    const observe = (page) => page.evaluate(() => ({ state: window.inspectStrokeBatchHistory(), network: window.__brushspaceCollab.debugState(), data: window.strokeBatchPersistence.snapshot() }));
    const stages = [];
    const save = async (stage) => {
      const state = { stage, host: await observe(host), guest: await observe(guest) };
      stages.push(state);
      await writeFile(path.join(output, enabled ? "batched.json" : "reference.json"), JSON.stringify({ enabled, browser: browser.version(), errors, stages }, null, 2));
      return state;
    };
    const initialGuid = await host.evaluate(() => window.__brushspaceCollab.debugCommitTestStroke());
    await host.evaluate(() => window.__brushspaceCollab.toggleHosting());
    await host.waitForFunction(() => window.inspectStrokeBatchHistory().collab.status === "hosting", undefined, { timeout: 45000 });
    const code = await host.evaluate(() => window.inspectStrokeBatchHistory().collab.code);
    await guest.evaluate((code) => window.__brushspaceCollab.joinWithCode(code), code);
    await guest.waitForFunction(() => window.inspectStrokeBatchHistory().collab.status === "connected", undefined, { timeout: 60000 });
    await host.waitForFunction(() => window.inspectStrokeBatchHistory().collab.status === "connected", undefined, { timeout: 60000 });
    await guest.waitForFunction((guid) => window.inspectStrokeBatchHistory().strokes.some((stroke) => stroke.guid === guid && stroke.finalized), initialGuid);
    const initial = await save("snapshot-received");
    check(initial.guest.state.strokes.length === 1, "Snapshot duplicated strokes");
    const compare = (state, guid) => {
      const source = state.host.data.find((stroke) => stroke.guid === guid);
      const received = state.guest.data.find((stroke) => stroke.guid === guid);
      check(source && received, "Peer snapshot missing visible stroke");
      for (const field of ["brushGuid", "brushSize", "seed", "lastControlPointIsKeeper", "color", "controlPoints"])
        check(JSON.stringify(source[field]) === JSON.stringify(received[field]), `Peer data differs: ${field}`);
      const left = state.host.state.strokes.find((stroke) => stroke.guid === guid);
      const right = state.guest.state.strokes.find((stroke) => stroke.guid === guid);
      check(left.batched === enabled && right.batched === enabled && left.privateVisible === !enabled && right.privateVisible === !enabled, "Final peer rendering ownership mismatch");
    };
    compare(initial, initialGuid);
    const draw = async (page, y, steps) => {
      await page.bringToFront();
      await page.evaluate(() => window.inspectStrokeBatchHistory(true));
      await page.mouse.move(560, y);
      await page.mouse.down();
      for (let i = 0; i < steps; i += 1) {
        await page.mouse.move(570 + (i % 17) * 10, y + Math.sin(i * 0.3) * 12);
        await page.waitForTimeout(30);
      }
      await page.mouse.up();
      await page.waitForTimeout(300);
    };
    await draw(host, 350, 120);
    const sourceState = await observe(host);
    const liveGuid = sourceState.state.strokes.find((stroke) => stroke.guid !== initialGuid).guid;
    await guest.waitForFunction((guid) => window.inspectStrokeBatchHistory().strokes.some((stroke) => stroke.guid === guid && stroke.finalized), liveGuid, { timeout: 30000 });
    const live = await save("host-live-transfer");
    compare(live, liveGuid);
    check(live.host.data.find((stroke) => stroke.guid === liveGuid).controlPoints.length > 50, "Stroke did not exercise multiple final point chunks");
    await draw(guest, 420, 18);
    const guestSource = await observe(guest);
    const guestGuid = guestSource.state.strokes.find((stroke) => !live.guest.state.strokes.some((old) => old.guid === stroke.guid)).guid;
    await host.waitForFunction((guid) => window.inspectStrokeBatchHistory().strokes.some((stroke) => stroke.guid === guid && stroke.finalized), guestGuid, { timeout: 30000 });
    const bidirectional = await save("guest-live-transfer");
    compare(bidirectional, guestGuid);
    await guest.keyboard.press("z");
    await host.waitForFunction((guid) => window.inspectStrokeBatchHistory().strokes.some((stroke) => stroke.guid === guid && !stroke.visible), guestGuid);
    const undone = await save("guest-undo-transmitted");
    check(!undone.host.state.strokes.find((stroke) => stroke.guid === guestGuid).privateVisible, "Remote undo left private geometry visible");
    await guest.keyboard.press("y");
    await host.waitForFunction((guid) => window.inspectStrokeBatchHistory().strokes.some((stroke) => stroke.guid === guid && stroke.visible), guestGuid);
    const redone = await save("guest-redo-transmitted");
    compare(redone, guestGuid);
    check(errors.length === 0, "Runtime errors recorded");
    console.log(JSON.stringify({ enabled, connectedPeers: 2, strokes: redone.host.state.strokes.length, chunkedPoints: live.host.data.find((stroke) => stroke.guid === liveGuid).controlPoints.length, bidirectional: true, visibilityUndoRedo: true }));
    await host.close();
    await guest.close();
  }
} finally {
  await browser.close();
}

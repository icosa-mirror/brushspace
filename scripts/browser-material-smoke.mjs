import { spawn } from "node:child_process";
import { chromium } from "playwright";

const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const timeoutMs = 120_000;
const oilPaintGuid = "f72ec0e7-a844-4e38-82e3-140c44772699";
const compatibilityStorageKey =
  "brushspace.openBrushShaderCompatibility.v1";

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--mode",
    "http",
    "--host",
    host,
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

let browser;
try {
  await waitForServer(`${baseUrl}/`, timeoutMs);
  browser = await chromium.launch({
    channel: "chrome",
    headless: process.env.BRUSHSPACE_SMOKE_VISIBLE !== "1",
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const readyMessage = page.waitForEvent("console", {
    predicate: (message) =>
      /OpenBrush brush shader materials ready: \d+\/\d+ supported brushes\./.test(
        message.text(),
      ),
    timeout: timeoutMs,
  });

  await page.goto(
    `${baseUrl}/?visual-conformance=oil-paint&brush-guid=${oilPaintGuid}`,
    { waitUntil: "domcontentloaded", timeout: timeoutMs },
  );
  const consoleMessage = await readyMessage;
  const counts = consoleMessage.text().match(/ready: (\d+)\/(\d+)/);
  if (!counts || counts[1] !== counts[2]) {
    throw new Error(`Material load gate failed: ${consoleMessage.text()}`);
  }

  await page.waitForFunction(
    () => document.documentElement.dataset.brushVisualConformance,
    undefined,
    { timeout: timeoutMs },
  );
  const visualStatus = await page.evaluate(
    () => document.documentElement.dataset.brushVisualConformance,
  );
  if (visualStatus !== "pass") {
    throw new Error(`Oil Paint visual coverage gate reported ${visualStatus}.`);
  }

  const compatibility = await page.evaluate((storageKey) => {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value) : [];
  }, compatibilityStorageKey);
  const browserRecords = compatibility.filter(
    (record) => record.context === "browser",
  );
  const compileFailures = browserRecords.filter(
    (record) => record.status !== "ready",
  );
  if (browserRecords.length !== Number(counts[2])) {
    throw new Error(
      `Expected ${counts[2]} browser compile records, found ${browserRecords.length}.`,
    );
  }
  if (compileFailures.length > 0) {
    throw new Error(
      `Shader compile failures: ${compileFailures
        .map((record) => `${record.name}: ${record.message ?? record.status}`)
        .join("; ")}`,
    );
  }
  if (pageErrors.length > 0) {
    throw new Error(`Uncaught page errors: ${pageErrors.join("; ")}`);
  }

  console.log(
    `Browser material smoke passed: ${counts[1]}/${counts[2]} compiled; Oil Paint coverage passed.`,
  );
} catch (error) {
  if (serverOutput.trim()) {
    process.stderr.write(serverOutput);
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
}

async function waitForServer(url, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The preview process may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

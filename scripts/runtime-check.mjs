import { spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "browser";
if (!["browser", "xr"].includes(mode)) {
  console.error("Usage: node scripts/runtime-check.mjs <browser|xr>");
  process.exit(1);
}

const result = spawnSync("npx", ["iwsdk", "dev", "status"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

let status;
try {
  status = JSON.parse(result.stdout);
} catch {
  console.error("Unable to parse `iwsdk dev status` output as JSON.");
  process.stdout.write(result.stdout);
  process.exit(1);
}

const state = status.data?.state;
if (!state?.running || !state?.browserConnected) {
  console.error("IWSDK runtime is not ready for browser/runtime checks.");
  console.error("Start it with `npm run dev`, then rerun this command.");
  console.error(JSON.stringify(state, null, 2));
  process.exit(1);
}

if (mode === "xr") {
  const xrStatus = spawnSync("npx", ["iwsdk", "xr", "status"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (xrStatus.status !== 0) {
    process.stderr.write(xrStatus.stderr);
    process.exit(xrStatus.status ?? 1);
  }

  let xr;
  try {
    xr = JSON.parse(xrStatus.stdout);
  } catch {
    console.error("Unable to parse `iwsdk xr status` output as JSON.");
    process.stdout.write(xrStatus.stdout);
    process.exit(1);
  }

  if (!xr.data?.result?.sessionActive) {
    console.error("IWSDK runtime is ready, but no XR session is active.");
    console.error("Use the runtime XR tools or the in-app button to enter XR first.");
    process.exit(1);
  }
}

console.log(`IWSDK ${mode} runtime check passed.`);

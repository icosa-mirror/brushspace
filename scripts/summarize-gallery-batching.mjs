import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node scripts/summarize-gallery-batching.mjs <directory>");
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
};
const stats = (values) => ({ samples: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) });
const rawImage = async (file) => sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const compare = (a, b) => {
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) throw new Error("Image dimensions differ");
  let squared = 0;
  let changedPixels = 0;
  for (let i = 0; i < a.data.length; i += 3) {
    let changed = false;
    for (let c = 0; c < 3; c++) {
      const difference = Math.abs(a.data[i + c] - b.data[i + c]);
      squared += difference * difference;
      changed ||= difference > 5;
    }
    changedPixels += Number(changed);
  }
  return { rms: Math.sqrt(squared / a.data.length), changedPixelPercent: changedPixels * 300 / a.data.length };
};
const runs = [];
const images = [];
let firstCamera;
for (const pair of [1, 2, 3]) {
  for (const mode of ["reference", "batched"]) {
    const location = path.join(directory, `pair${pair}`, mode);
    const data = JSON.parse(await readFile(`${location}.json`, "utf8"));
    firstCamera ??= JSON.stringify(data.camera);
    const sample = data.sample;
    if (data.errors.length || sample.hidden || sample.overflow || sample.disjointCount ||
      sample.beforeUploads !== sample.afterUploads || JSON.stringify(data.camera) !== firstCamera) {
      throw new Error(`Invalid measurement in pair ${pair}, ${mode}`);
    }
    runs.push({ pair, mode, browser: data.browser, gpu: data.gpu,
      calls: sample.calls, triangles: sample.triangles, durationMs: sample.durationMs,
      strokes: data.state.brushes.reduce((sum, brush) => sum + brush.strokes, 0),
      batchedStrokes: data.state.brushes.reduce((sum, brush) => sum + brush.batched, 0),
      intervalsMs: stats(sample.intervalsMs), ecsCpuMs: stats(sample.ecsCpuMs),
      renderCpuMs: stats(sample.renderCpuMs), gpuRenderMs: stats(sample.gpuRenderMs),
      beforeMemory: sample.beforeMemory, afterMemory: sample.afterMemory,
    });
    images.push({ pair, mode, image: await rawImage(`${location}.png`) });
  }
}
const imageComparisons = [1, 2, 3].map((pair) => ({ pair,
  ...compare(images.find((i) => i.pair === pair && i.mode === "reference").image,
    images.find((i) => i.pair === pair && i.mode === "batched").image),
}));
const referenceVariation = [2, 3].map((pair) => ({ pair,
  ...compare(images[0].image, images.find((i) => i.pair === pair && i.mode === "reference").image),
}));
const medians = Object.fromEntries(["reference", "batched"].map((mode) => [mode,
  Object.fromEntries(["intervalsMs", "ecsCpuMs", "renderCpuMs", "gpuRenderMs"].map((metric) => [metric,
    percentile(runs.filter((run) => run.mode === mode).map((run) => run[metric].p95), 0.5),
  ])),
]));
const summary = { workload: "curated gallery sketch, 4496 strokes", order: ["off/on", "on/off", "off/on"],
  caveat: "Browser diagnostic, not headset/XR acceptance. Images contain animated shader variation.",
  runs, mediansOfRunP95Ms: medians, imageComparisons, referenceVariation };
await writeFile(path.join(directory, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ mediansOfRunP95Ms: medians, imageComparisons, referenceVariation }));

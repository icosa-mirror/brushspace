#!/usr/bin/env node
// Extracts each brush's looping draw-audio layers from the Open Brush Unity
// descriptors (m_BrushAudioLayers) plus the volume envelope params, converts
// the wavs to mono Ogg Opus (~15x smaller than the originals), and writes:
//   public/audio/brushes/<clip>.ogg
//   src/brushes/generated/brush-audio.json
//
// Run: node scripts/extract-brush-audio.mjs   (requires ffmpeg)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brushesDir = path.join(repoRoot, "reference/Assets/Resources/Brushes");
const audioDirs = [
  path.join(repoRoot, "reference/Assets/Resources/BrushAudio"),
  path.join(repoRoot, "reference/Assets/Resources/X/BrushAudio"),
];
const outAudioDir = path.join(repoRoot, "public/audio/brushes");
const outJsonPath = path.join(
  repoRoot,
  "src/brushes/generated/brush-audio.json",
);

// Meta-guid -> wav path for every BrushAudio clip.
const clipByGuid = new Map();
for (const dir of audioDirs) {
  if (!fs.existsSync(dir)) {
    continue;
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".wav.meta")) {
      continue;
    }
    const meta = fs.readFileSync(path.join(dir, file), "utf8");
    const guid = meta.match(/^guid: ([0-9a-f]{32})$/m)?.[1];
    if (guid) {
      clipByGuid.set(guid, path.join(dir, file.replace(/\.meta$/, "")));
    }
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.name.endsWith(".asset")) {
      out.push(full);
    }
  }
  return out;
}

function numberField(text, name, fallback) {
  const match = text.match(new RegExp(`^\\s*${name}: (-?[0-9.eE+]+)$`, "m"));
  return match ? Number(match[1]) : fallback;
}

const brushAudio = {};
const usedClips = new Map(); // source path -> output file name
let brushesWithAudio = 0;

for (const assetPath of walk(brushesDir)) {
  const text = fs.readFileSync(assetPath, "utf8");
  const brushGuid = text.match(
    /^\s*m_Guid:\s*\n\s*m_storage: ([0-9a-fA-F-]{36})$/m,
  )?.[1];
  if (!brushGuid) {
    continue;
  }
  const layersBlock = text.match(
    /^\s*m_BrushAudioLayers:\s*\n((?:\s*- \{fileID: \d+, guid: [0-9a-f]{32}, type: \d+\}\n)*)/m,
  );
  if (!layersBlock || !layersBlock[1]) {
    continue;
  }
  const layers = [];
  for (const match of layersBlock[1].matchAll(/guid: ([0-9a-f]{32})/g)) {
    const clipPath = clipByGuid.get(match[1]);
    if (!clipPath) {
      continue;
    }
    let outName = usedClips.get(clipPath);
    if (!outName) {
      outName = path.basename(clipPath).replace(/\.wav$/, ".ogg");
      usedClips.set(clipPath, outName);
    }
    layers.push(outName);
  }
  if (layers.length === 0) {
    continue;
  }
  brushesWithAudio += 1;
  brushAudio[brushGuid.toLowerCase()] = {
    layers,
    basePitch: numberField(text, "m_BrushAudioBasePitch", 1),
    maxPitchShift: numberField(text, "m_BrushAudioMaxPitchShift", 0),
    maxVolume: numberField(text, "m_BrushAudioMaxVolume", 1),
    volumeUpSpeed: numberField(text, "m_BrushVolumeUpSpeed", 4),
    volumeDownSpeed: numberField(text, "m_BrushVolumeDownSpeed", 4),
    velocityRangeMultiplier: numberField(
      text,
      "m_VolumeVelocityRangeMultiplier",
      1,
    ),
  };
}

fs.mkdirSync(outAudioDir, { recursive: true });
let totalBytes = 0;
for (const [sourcePath, outName] of usedClips) {
  const outPath = path.join(outAudioDir, outName.replace(/\.wav$/, ".ogg"));
  // Mono Opus in Ogg: compact, decodes natively in Chromium, and keeps loop
  // points close enough that the noise-textured paint loops stay seamless.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", sourcePath,
    "-ac", "1",
    "-c:a", "libopus",
    "-b:a", "48k",
    outPath,
  ]);
  totalBytes += fs.statSync(outPath).size;
}

fs.writeFileSync(outJsonPath, JSON.stringify(brushAudio, null, 1) + "\n");
console.log(
  `Brush audio: ${brushesWithAudio} brushes, ${usedClips.size} clips, ${(totalBytes / 1048576).toFixed(1)} MB`,
);

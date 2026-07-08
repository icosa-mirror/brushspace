#!/usr/bin/env node
// Extracts Open Brush's intro sketch (the welcome-screen drawing) from the
// Unity prefab, where the meshes are embedded as serialized Mesh blocks.
// Outputs a compact binary + manifest that the runtime renders with the real
// brush shaders:
//   public/openbrush/intro/intro.bin
//   public/openbrush/intro/intro.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prefabPath = path.join(
  repoRoot,
  "reference/Assets/Prefabs/Intro/openbrush_intro_simple.prefab",
);
const introMaterialsDir = path.join(
  repoRoot,
  "reference/Assets/Materials/IntroMaterials",
);
const brushAssetsPath = path.join(
  repoRoot,
  "src/brushes/generated/brush-assets.json",
);
const manifestPath = path.join(
  repoRoot,
  "src/brushes/generated/exportManifest.json",
);
const outDir = path.join(repoRoot, "public/openbrush/intro");

// ---------------------------------------------------------------------------
// Material guid -> brush guid
// ---------------------------------------------------------------------------

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildMaterialToBrushMap() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const brushByName = new Map();
  for (const [guid, brush] of Object.entries(manifest.brushes)) {
    brushByName.set(normalizeName(brush.name), guid);
  }

  const map = new Map();
  for (const file of fs.readdirSync(introMaterialsDir)) {
    if (!file.endsWith(".mat.meta")) {
      continue;
    }
    const meta = fs.readFileSync(path.join(introMaterialsDir, file), "utf8");
    const guidMatch = meta.match(/guid: ([0-9a-f]{32})/);
    if (!guidMatch) {
      continue;
    }
    let name = file.replace(".mat.meta", "").replace(/^Intro_/, "");
    name = name.replace(/DoubleSided$/, "").replace(/SingleSided$/, "");
    const brushGuid = brushByName.get(normalizeName(name));
    if (brushGuid) {
      map.set(guidMatch[1], { brushGuid, materialName: name });
    } else if (normalizeName(name) === "diffusenotexture") {
      // Generic vertex-color diffuse; rendered with a plain fallback.
      map.set(guidMatch[1], { brushGuid: "", materialName: name });
    } else {
      console.warn(`No brush match for intro material ${file} (${name})`);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Prefab parsing
// ---------------------------------------------------------------------------

function parseDocuments(text) {
  const docs = new Map();
  for (const block of text.split("--- !u!").slice(1)) {
    const header = block.match(/^(\d+) &(-?\d+)/);
    if (!header) {
      continue;
    }
    docs.set(header[2], { classId: Number(header[1]), body: block });
  }
  return docs;
}

function parseChannels(body) {
  const channelsSection = body.match(
    /m_Channels:\n([\s\S]*?)\n\s+m_DataSize:/,
  );
  if (!channelsSection) {
    return [];
  }
  const channels = [];
  const entryPattern =
    /- stream: (\d+)\s+offset: (\d+)\s+format: (\d+)\s+dimension: (\d+)/g;
  let match;
  while ((match = entryPattern.exec(channelsSection[1]))) {
    channels.push({
      stream: Number(match[1]),
      offset: Number(match[2]),
      format: Number(match[3]),
      dimension: Number(match[4]),
    });
  }
  return channels;
}

function channelSize(channel) {
  // format 0 = float32, 1 = float16, 2 = unorm8
  const bytes = channel.format === 0 ? 4 : channel.format === 1 ? 2 : 1;
  return bytes * channel.dimension;
}

function parseMesh(body) {
  const vertexCount = Number(body.match(/m_VertexCount: (\d+)/)?.[1] ?? 0);
  const indexCount = Number(body.match(/indexCount: (\d+)/)?.[1] ?? 0);
  const indexFormat = Number(body.match(/m_IndexFormat: (\d+)/)?.[1] ?? 0);
  const indexHex = body.match(/m_IndexBuffer: ([0-9a-f]+)/)?.[1] ?? "";
  const dataHex = body.match(/_typelessdata: ([0-9a-f]+)/)?.[1] ?? "";
  const channels = parseChannels(body);
  if (!vertexCount || !indexCount || !dataHex) {
    return undefined;
  }
  return { vertexCount, indexCount, indexFormat, indexHex, dataHex, channels };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const materialMap = buildMaterialToBrushMap();
const text = fs.readFileSync(prefabPath, "utf8");
const docs = parseDocuments(text);

// gameObject id -> { meshId, materialGuid }
const byGameObject = new Map();
for (const [, doc] of docs) {
  if (doc.classId === 33) {
    const go = doc.body.match(/m_GameObject: \{fileID: (-?\d+)\}/)?.[1];
    const mesh = doc.body.match(/m_Mesh: \{fileID: (-?\d+)\}/)?.[1];
    if (go && mesh) {
      byGameObject.set(go, { ...(byGameObject.get(go) ?? {}), meshId: mesh });
    }
  } else if (doc.classId === 23) {
    const go = doc.body.match(/m_GameObject: \{fileID: (-?\d+)\}/)?.[1];
    const material = doc.body.match(
      /m_Materials:\n\s+- \{fileID: \d+, guid: ([0-9a-f]{32})/,
    )?.[1];
    if (go && material) {
      byGameObject.set(go, {
        ...(byGameObject.get(go) ?? {}),
        materialGuid: material,
      });
    }
  }
}

const binParts = [];
let binOffset = 0;
const nodes = [];
let skipped = 0;

function pushBuffer(buffer) {
  const offset = binOffset;
  binParts.push(buffer);
  binOffset += buffer.byteLength;
  return offset;
}

for (const [go, refs] of byGameObject) {
  if (!refs.meshId || !refs.materialGuid) {
    continue;
  }
  const material = materialMap.get(refs.materialGuid);
  const meshDoc = docs.get(refs.meshId);
  if (!material || !meshDoc || meshDoc.classId !== 43) {
    if (!material) {
      console.warn(`Skipping node with unmapped material guid ${refs.materialGuid}`);
    }
    skipped += 1;
    continue;
  }
  const mesh = parseMesh(meshDoc.body);
  if (!mesh) {
    skipped += 1;
    continue;
  }

  const data = Buffer.from(mesh.dataHex, "hex");
  const stride = mesh.channels
    .filter((channel) => channel.dimension > 0)
    .reduce((total, channel) => Math.max(total, channel.offset + channelSize(channel)), 0);

  // Channel order (Unity): 0 position, 1 normal, 2 tangent, 3 color, 4 uv0, 5 uv1.
  const read = (channelIndex, TargetArray) => {
    const channel = mesh.channels[channelIndex];
    if (!channel || channel.dimension === 0) {
      return undefined;
    }
    const out = new TargetArray(mesh.vertexCount * channel.dimension);
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      const base = v * stride + channel.offset;
      for (let c = 0; c < channel.dimension; c += 1) {
        if (channel.format === 0) {
          out[v * channel.dimension + c] = data.readFloatLE(base + c * 4);
        } else if (channel.format === 2) {
          out[v * channel.dimension + c] = data.readUInt8(base + c);
        }
      }
    }
    return out;
  };

  const positions = read(0, Float32Array);
  const normals = read(1, Float32Array);
  const colors = read(3, Uint8Array);
  const uv0 = read(4, Float32Array);
  const uv1 = read(5, Float32Array);
  if (!positions) {
    skipped += 1;
    continue;
  }

  // Unity is left-handed with +Z forward; three is right-handed with -Z
  // forward. Mirror Z (not a rotation, so text stays readable) and flip the
  // triangle winding to match.
  for (let v = 0; v < mesh.vertexCount; v += 1) {
    positions[v * 3 + 2] = -positions[v * 3 + 2];
    if (normals) {
      normals[v * 3 + 2] = -normals[v * 3 + 2];
    }
  }

  const indexData = Buffer.from(mesh.indexHex, "hex");
  const indices = new Uint32Array(mesh.indexCount);
  for (let i = 0; i < mesh.indexCount; i += 1) {
    indices[i] =
      mesh.indexFormat === 0
        ? indexData.readUInt16LE(i * 2)
        : indexData.readUInt32LE(i * 4);
  }
  for (let i = 0; i + 2 < mesh.indexCount; i += 3) {
    const swap = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = swap;
  }

  const node = {
    brushGuid: material.brushGuid,
    materialName: material.materialName,
    vertexCount: mesh.vertexCount,
    indexCount: mesh.indexCount,
    positionsOffset: pushBuffer(Buffer.from(positions.buffer)),
    normalsOffset: normals ? pushBuffer(Buffer.from(normals.buffer)) : -1,
    colorsOffset: colors ? pushBuffer(Buffer.from(colors.buffer)) : -1,
    uv0Offset: uv0 ? pushBuffer(Buffer.from(uv0.buffer)) : -1,
    uv0Dimension: mesh.channels[4]?.dimension ?? 0,
    uv1Offset: uv1 ? pushBuffer(Buffer.from(uv1.buffer)) : -1,
    uv1Dimension: mesh.channels[5]?.dimension ?? 0,
    indicesOffset: pushBuffer(Buffer.from(indices.buffer)),
  };
  nodes.push(node);
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "intro.bin"), Buffer.concat(binParts));
fs.writeFileSync(
  path.join(outDir, "intro.json"),
  JSON.stringify({ nodes }, null, 1) + "\n",
);

const totalVerts = nodes.reduce((sum, node) => sum + node.vertexCount, 0);
console.log(
  `Intro sketch: ${nodes.length} nodes, ${totalVerts} vertices, ${(binOffset / 1048576).toFixed(1)} MB bin (${skipped} skipped)`,
);
const brushes = new Set(nodes.map((node) => node.materialName));
console.log("Brushes:", [...brushes].join(", "));

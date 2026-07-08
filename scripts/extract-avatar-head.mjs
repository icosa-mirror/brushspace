#!/usr/bin/env node
// Extracts the intro-sketch bird's head as a standalone mesh asset for the
// P2P avatar. The intro geometry has no strokes (it is baked Unity mesh
// data), so "strokes" here are connected triangle components; a component is
// kept when its bounding box lies fully inside the head box below (dialed in
// visually: beak, eyes, crest, and throat ruff in, campfire/stick/body out).
// Outputs:
//   public/openbrush/avatar/head.bin
//   public/openbrush/avatar/head.json   (same node layout as intro.json)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const introDir = path.join(repoRoot, "public/openbrush/intro");
const outDir = path.join(repoRoot, "public/openbrush/avatar");

// Head box in intro-local units (decimeters), from the shrinking-box pass:
// floor at the chin (the neck/chest feather mass reads as body), ceiling and
// back-left reach covering the long crest feathers (they sweep up to y=10.5
// and back to x=-40.9).
const BOX_CENTER = [-37.35, 7.4, -15.85];
const BOX_HALF = [3.85, 3.6, 3.35];
// The bird's eyes; the sparkle quads next to them are tiny and must survive
// the speck filter below.
const EYES = [
  [-36.1, 6.0, -15.3],
  [-37.2, 6.0, -17.4],
];

const manifest = JSON.parse(fs.readFileSync(path.join(introDir, "intro.json"), "utf8"));
const bin = fs.readFileSync(path.join(introDir, "intro.bin"));
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);

function unionFind(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  return {
    find,
    union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    },
  };
}

const lo = BOX_CENTER.map((c, i) => c - BOX_HALF[i]);
const hi = BOX_CENTER.map((c, i) => c + BOX_HALF[i]);

const outNodes = [];
const outBuffers = [];
let outOffset = 0;
const headMin = [1e9, 1e9, 1e9];
const headMax = [-1e9, -1e9, -1e9];
let keptComponents = 0;

function push(buffer) {
  const offset = outOffset;
  outBuffers.push(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  outOffset += buffer.byteLength;
  return offset;
}

for (const node of manifest.nodes) {
  const positions = new Float32Array(ab, node.positionsOffset, node.vertexCount * 3);
  const colors = node.colorsOffset >= 0
    ? new Uint8Array(ab, node.colorsOffset, node.vertexCount * 4)
    : undefined;
  const indices = new Uint32Array(ab, node.indicesOffset, node.indexCount);

  // Connected components over shared vertices.
  const uf = unionFind(node.vertexCount);
  for (let i = 0; i < indices.length; i += 3) {
    uf.union(indices[i], indices[i + 1]);
    uf.union(indices[i], indices[i + 2]);
  }
  const compMin = new Map();
  const compMax = new Map();
  const compVerts = new Map();
  const compColor = new Map();
  for (let v = 0; v < node.vertexCount; v += 1) {
    const root = uf.find(v);
    let mn = compMin.get(root);
    if (!mn) {
      compMin.set(root, (mn = [1e9, 1e9, 1e9]));
      compMax.set(root, [-1e9, -1e9, -1e9]);
      compVerts.set(root, 0);
      compColor.set(root, [0, 0, 0]);
    }
    const mx = compMax.get(root);
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[v * 3 + axis];
      if (value < mn[axis]) mn[axis] = value;
      if (value > mx[axis]) mx[axis] = value;
    }
    compVerts.set(root, compVerts.get(root) + 1);
    if (colors) {
      const sum = compColor.get(root);
      sum[0] += colors[v * 4] / 255;
      sum[1] += colors[v * 4 + 1] / 255;
      sum[2] += colors[v * 4 + 2] / 255;
    }
  }
  const keep = new Set();
  for (const [root, mn] of compMin) {
    const mx = compMax.get(root);
    const insideBox = mn.every((v, i) => v >= lo[i]) && mx.every((v, i) => v <= hi[i]);
    if (!insideBox) {
      continue;
    }
    const vertCount = compVerts.get(root);
    const [r, g, b] = compColor.get(root).map((c) => c / vertCount);
    const center = mn.map((v, i) => (v + mx[i]) / 2);
    const eyeDist = Math.min(
      ...EYES.map((e) => Math.hypot(...center.map((v, i) => v - e[i]))),
    );
    const maxDim = Math.max(...mx.map((v, i) => v - mn[i]));
    // Noise inside the box: campfire-red streaks, isolated specks away from
    // the face (the eye sparkles are equally tiny but sit on the eyes), and
    // degenerate point clusters.
    const isReddish = r > 1.8 * g && r > 0.15;
    const isStraySpeck = vertCount <= 8 && eyeDist > 1.2;
    const isDegenerate = maxDim < 0.05 && eyeDist > 2;
    if (isReddish || isStraySpeck || isDegenerate) {
      continue;
    }
    keep.add(root);
    keptComponents += 1;
    for (let axis = 0; axis < 3; axis += 1) {
      if (mn[axis] < headMin[axis]) headMin[axis] = mn[axis];
      if (mx[axis] > headMax[axis]) headMax[axis] = mx[axis];
    }
  }
  if (keep.size === 0) {
    continue;
  }

  // Remap kept vertices into compact buffers.
  const remap = new Int32Array(node.vertexCount).fill(-1);
  let nextVertex = 0;
  for (let v = 0; v < node.vertexCount; v += 1) {
    if (keep.has(uf.find(v))) {
      remap[v] = nextVertex;
      nextVertex += 1;
    }
  }
  const newIndices = [];
  for (let i = 0; i < indices.length; i += 3) {
    if (remap[indices[i]] >= 0) {
      newIndices.push(remap[indices[i]], remap[indices[i + 1]], remap[indices[i + 2]]);
    }
  }

  const sliceFloats = (offset, perVertex) => {
    if (offset < 0) {
      return undefined;
    }
    const source = new Float32Array(ab, offset, node.vertexCount * perVertex);
    const out = new Float32Array(nextVertex * perVertex);
    for (let v = 0; v < node.vertexCount; v += 1) {
      const target = remap[v];
      if (target >= 0) {
        for (let k = 0; k < perVertex; k += 1) {
          out[target * perVertex + k] = source[v * perVertex + k];
        }
      }
    }
    return out;
  };

  const newPositions = sliceFloats(node.positionsOffset, 3);
  const newNormals = node.normalsOffset >= 0 ? sliceFloats(node.normalsOffset, 3) : undefined;
  let newColors;
  if (node.colorsOffset >= 0) {
    const source = new Uint8Array(ab, node.colorsOffset, node.vertexCount * 4);
    newColors = new Uint8Array(nextVertex * 4);
    for (let v = 0; v < node.vertexCount; v += 1) {
      const target = remap[v];
      if (target >= 0) {
        newColors.set(source.subarray(v * 4, v * 4 + 4), target * 4);
      }
    }
  }
  const newUv0 = node.uv0Offset >= 0 ? sliceFloats(node.uv0Offset, node.uv0Dimension) : undefined;
  const newUv1 = node.uv1Offset >= 0 ? sliceFloats(node.uv1Offset, node.uv1Dimension) : undefined;

  outNodes.push({
    brushGuid: node.brushGuid,
    materialName: node.materialName,
    vertexCount: nextVertex,
    indexCount: newIndices.length,
    positionsOffset: push(newPositions),
    normalsOffset: newNormals ? push(newNormals) : -1,
    colorsOffset: newColors ? push(newColors) : -1,
    uv0Offset: newUv0 ? push(newUv0) : -1,
    uv0Dimension: newUv0 ? node.uv0Dimension : 0,
    uv1Offset: newUv1 ? push(newUv1) : -1,
    uv1Dimension: newUv1 ? node.uv1Dimension : 0,
    indicesOffset: push(new Uint32Array(newIndices)),
  });
}

// Recenter on the vertex center of mass (a natural head pivot) and rotate
// +90deg about Y so the bird faces -Z - the three.js camera/head forward -
// letting consumers apply a viewer's head pose directly. Units stay
// intro-local decimeters (the spawner applies world scale).
const combined = Buffer.concat(outBuffers);
const centerOfMass = [0, 0, 0];
let vertexTotal = 0;
for (const node of outNodes) {
  const positions = new Float32Array(
    combined.buffer,
    combined.byteOffset + node.positionsOffset,
    node.vertexCount * 3,
  );
  for (let v = 0; v < node.vertexCount; v += 1) {
    centerOfMass[0] += positions[v * 3];
    centerOfMass[1] += positions[v * 3 + 1];
    centerOfMass[2] += positions[v * 3 + 2];
  }
  vertexTotal += node.vertexCount;
}
for (let axis = 0; axis < 3; axis += 1) {
  centerOfMass[axis] /= vertexTotal;
}
// rotY(+90deg): (x, y, z) -> (z, y, -x)
for (const node of outNodes) {
  const positions = new Float32Array(
    combined.buffer,
    combined.byteOffset + node.positionsOffset,
    node.vertexCount * 3,
  );
  for (let v = 0; v < node.vertexCount; v += 1) {
    const x = positions[v * 3] - centerOfMass[0];
    const y = positions[v * 3 + 1] - centerOfMass[1];
    const z = positions[v * 3 + 2] - centerOfMass[2];
    positions[v * 3] = z;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = -x;
  }
  if (node.normalsOffset >= 0) {
    const normals = new Float32Array(
      combined.buffer,
      combined.byteOffset + node.normalsOffset,
      node.vertexCount * 3,
    );
    for (let v = 0; v < node.vertexCount; v += 1) {
      const x = normals[v * 3];
      const z = normals[v * 3 + 2];
      normals[v * 3] = z;
      normals[v * 3 + 2] = -x;
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "head.bin"), combined);
fs.writeFileSync(
  path.join(outDir, "head.json"),
  JSON.stringify(
    {
      // Origin at the vertex center of mass, bird facing -Z (three.js head
      // forward); units are decimeters.
      forwardAxis: "-z",
      units: "decimeters",
      // Post-rotation extents: x picks up the old depth, z the old width.
      size: [
        Number((headMax[2] - headMin[2]).toFixed(3)),
        Number((headMax[1] - headMin[1]).toFixed(3)),
        Number((headMax[0] - headMin[0]).toFixed(3)),
      ],
      nodes: outNodes,
    },
    null,
    2,
  ),
);

let totalVerts = 0;
for (const node of outNodes) totalVerts += node.vertexCount;
console.log(
  `avatar head: ${outNodes.length} nodes, ${keptComponents} components, ${totalVerts} verts, ` +
    `${(combined.byteLength / 1024).toFixed(0)} KB, size dm=(${headMax.map((v, i) => (v - headMin[i]).toFixed(1)).join(",")})`,
);

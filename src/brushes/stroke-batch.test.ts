import { describe, expect, it } from "vitest";

import {
  MAX_BATCH_VERTICES,
  StrokeBatch,
  layoutFromArrays,
  type BatchVertexLayout,
} from "./stroke-batch.js";
import { StrokeBatchManager } from "./stroke-batch-manager.js";
import { stringifyBatchKey, type BrushBatchKey } from "./brush-batching.js";
import type { BrushGeometryArrays } from "./brush-geometry.js";

const LAYOUT: BatchVertexLayout = { uv0Size: 2, uv1Size: 0 };

/**
 * Minimal geometry arrays: `vertices` quads' worth of distinct vertices with
 * recognisable values, indexed as a fan so index rebasing is observable.
 */
function makeArrays(
  vertices: number,
  seed: number,
  layout: BatchVertexLayout = LAYOUT,
): BrushGeometryArrays {
  const indexCount = Math.max(0, (vertices - 2) * 3);
  const arrays = {
    family: "ribbon",
    positions: new Float32Array(vertices * 3),
    normals: new Float32Array(vertices * 3),
    tangents: new Float32Array(vertices * 4),
    colors: new Float32Array(vertices * 4),
    uvs: new Float32Array(vertices * 2),
    packedUvs: new Float32Array(vertices * 3),
    particleUvs: new Float32Array(vertices * 4),
    vectorUvs: new Float32Array(vertices * 3),
    uv1s: new Float32Array(vertices * 4),
    tubeBreakBefore: new Uint8Array(vertices),
    tubeFrameRights: new Float32Array(vertices * 3),
    tubeFrameUps: new Float32Array(vertices * 3),
    tubeTangents: new Float32Array(vertices * 3),
    tubeRadii: new Float32Array(vertices),
    tubeRingUs: new Float32Array(vertices),
    tubeOpacities: new Float32Array(vertices),
    ribbonBreakBefore: new Uint8Array(vertices),
    ribbonRunningLengths: new Float32Array(vertices),
    ribbonSectionLengths: new Float32Array(vertices),
    uv0Size: layout.uv0Size,
    uv1Size: layout.uv1Size,
    indices: new Uint32Array(indexCount),
    vertexCount: vertices,
    indexCount,
    bounds: {
      min: [seed, seed, seed],
      max: [seed + 1, seed + 1, seed + 1],
    },
  } as unknown as BrushGeometryArrays;

  for (let i = 0; i < vertices; i += 1) {
    arrays.positions[i * 3] = seed * 1000 + i;
    arrays.colors[i * 4] = seed;
    arrays.uvs[i * 2] = i;
  }
  for (let triangle = 0; triangle < vertices - 2; triangle += 1) {
    arrays.indices[triangle * 3] = 0;
    arrays.indices[triangle * 3 + 1] = triangle + 1;
    arrays.indices[triangle * 3 + 2] = triangle + 2;
  }
  return arrays;
}

function makeKey(overrides: Partial<BrushBatchKey> = {}): BrushBatchKey {
  return {
    layerIndex: 0,
    brushGuid: "brush-a",
    geometryFamily: "ribbon",
    materialFamily: "standard",
    transparent: false,
    materialMode: "managed-shader",
    renderPassContract: "single",
    supplementalAttributeContract: "none",
    materialInstanceKey: "brush-a",
    ...overrides,
  } as BrushBatchKey;
}

describe("StrokeBatch", () => {
  it("packs several strokes into one mesh and rebases their indices", () => {
    const batch = new StrokeBatch(LAYOUT);
    const first = batch.addSubset("a", makeArrays(4, 1));
    const second = batch.addSubset("b", makeArrays(4, 2));

    expect(batch.subsets).toHaveLength(2);
    expect(first.startVertex).toBe(0);
    expect(second.startVertex).toBe(4);
    expect(batch.vertexCount).toBe(8);

    // The second stroke's indices must point at its own vertices, not the
    // first stroke's — this is what makes one mesh render both correctly.
    const secondIndices = Array.from(
      batch.indices.subarray(
        second.startIndex,
        second.startIndex + second.indexCount,
      ),
    );
    expect(Math.min(...secondIndices)).toBe(4);
    expect(Math.max(...secondIndices)).toBe(7);

    // And its vertex data landed at its own offset.
    expect(batch.positions[second.startVertex * 3]).toBe(2000);
  });

  it("hides and restores a stroke by zeroing only its indices", () => {
    const batch = new StrokeBatch(LAYOUT);
    batch.addSubset("a", makeArrays(4, 1));
    const second = batch.addSubset("b", makeArrays(4, 2));
    const before = Array.from(batch.indices.subarray(0, batch.indexCount));
    const verticesBefore = Array.from(
      batch.positions.subarray(0, batch.vertexCount * 3),
    );

    batch.disableSubset(second);
    expect(second.active).toBe(false);
    for (let i = second.startIndex; i < second.startIndex + second.indexCount; i += 1) {
      expect(batch.indices[i]).toBe(0);
    }
    // The first stroke is untouched, and no vertex data moved.
    expect(
      Array.from(batch.indices.subarray(0, second.startIndex)),
    ).toEqual(before.slice(0, second.startIndex));
    expect(Array.from(batch.positions.subarray(0, batch.vertexCount * 3))).toEqual(
      verticesBefore,
    );

    batch.enableSubset(second);
    expect(second.active).toBe(true);
    expect(Array.from(batch.indices.subarray(0, batch.indexCount))).toEqual(before);
  });

  it("reclaims storage when the tail stroke is removed, but not the middle", () => {
    const batch = new StrokeBatch(LAYOUT);
    batch.addSubset("a", makeArrays(4, 1));
    const middle = batch.addSubset("b", makeArrays(4, 2));
    const tail = batch.addSubset("c", makeArrays(4, 3));
    expect(batch.vertexCount).toBe(12);

    // Removing the middle leaves dead space: later subsets keep their ranges.
    batch.removeSubset(middle);
    expect(batch.vertexCount).toBe(12);
    expect(tail.startVertex).toBe(8);
    expect(batch.subsets.map((s) => s.strokeGuid)).toEqual(["a", "c"]);

    // Removing the tail reclaims down to the end of the previous live subset,
    // which here also reclaims the dead space the middle left behind.
    batch.removeSubset(tail);
    expect(batch.vertexCount).toBe(4);
    expect(batch.indexCount).toBe(6);
  });

  it("translates only one subset and updates its bounds", () => {
    const batch = new StrokeBatch(LAYOUT);
    const first = batch.addSubset("a", makeArrays(4, 1));
    const second = batch.addSubset("b", makeArrays(4, 2));
    batch.clearDirtyFlags();
    const firstPosition = batch.positions[first.startVertex * 3];
    const secondPosition = batch.positions[second.startVertex * 3];

    expect(batch.translateSubset(second, [3, -2, 5])).toBe(true);

    expect(batch.positions[first.startVertex * 3]).toBe(firstPosition);
    expect(batch.positions[second.startVertex * 3]).toBe(secondPosition + 3);
    expect(second.bounds).toEqual({ min: [5, 0, 7], max: [6, 1, 8] });
    expect(batch.vertexDataDirty).toBe(true);
    expect(batch.topologyDirty).toBe(false);
  });

  it("treats an empty batch as always having space so huge strokes still render", () => {
    const batch = new StrokeBatch(LAYOUT);
    expect(batch.hasSpaceFor(MAX_BATCH_VERTICES * 2)).toBe(true);
    batch.addSubset("a", makeArrays(4, 1));
    expect(batch.hasSpaceFor(MAX_BATCH_VERTICES)).toBe(false);
  });

  it("only accepts strokes whose attribute widths match", () => {
    const batch = new StrokeBatch(LAYOUT);
    expect(batch.acceptsLayout({ uv0Size: 2, uv1Size: 0 })).toBe(true);
    expect(batch.acceptsLayout({ uv0Size: 3, uv1Size: 0 })).toBe(false);
    expect(
      layoutFromArrays(makeArrays(4, 1, { uv0Size: 3, uv1Size: 4 })),
    ).toEqual({ uv0Size: 3, uv1Size: 4 });
  });
});

describe("StrokeBatchManager", () => {
  it("collapses many strokes of one brush into a single draw call", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey();
    for (let i = 0; i < 500; i += 1) {
      manager.addStroke(`stroke-${i}`, key, makeArrays(4, i));
    }
    // 500 strokes, one material: one batch — this is the whole point of the
    // port. The per-stroke-entity path would have issued 500 draw calls.
    expect(manager.countBatches()).toBe(1);
    expect(manager.countStrokes()).toBe(500);
    expect(manager.getPools()).toHaveLength(1);
  });

  it("separates strokes that cannot share a material", () => {
    const manager = new StrokeBatchManager();
    manager.addStroke("a", makeKey(), makeArrays(4, 1));
    manager.addStroke("b", makeKey({ brushGuid: "brush-b" }), makeArrays(4, 2));
    manager.addStroke("c", makeKey({ layerIndex: 1 }), makeArrays(4, 3));
    expect(manager.countBatches()).toBe(3);
  });

  it("opens another batch once the vertex cap is reached", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey();
    const big = Math.floor(MAX_BATCH_VERTICES / 2) + 10;
    manager.addStroke("a", key, makeArrays(big, 1));
    manager.addStroke("b", key, makeArrays(big, 2));
    expect(manager.countBatches()).toBe(2);
    expect(manager.getPools()[0].batches[0].subsets).toHaveLength(1);
  });

  it("finds, hides, and removes a stroke by guid", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey();
    manager.addStroke("a", key, makeArrays(4, 1));
    manager.addStroke("b", key, makeArrays(4, 2));

    expect(manager.setStrokeVisible("b", false)).toBe(true);
    expect(manager.getLocation("b")?.subset.active).toBe(false);
    expect(manager.setStrokeVisible("b", true)).toBe(true);
    expect(manager.getLocation("b")?.subset.active).toBe(true);

    expect(manager.removeStroke("b")).toBe(true);
    expect(manager.getLocation("b")).toBeUndefined();
    expect(manager.removeStroke("b")).toBe(false);
    expect(manager.setStrokeVisible("missing", false)).toBe(false);
  });

  it("translates a stroke by guid", () => {
    const manager = new StrokeBatchManager();
    manager.addStroke("a", makeKey(), makeArrays(4, 1));

    expect(manager.translateStroke("a", [2, 3, 4])).toBe(true);
    expect(manager.getLocation("a")?.subset.bounds).toEqual({
      min: [3, 4, 5],
      max: [4, 5, 6],
    });
    expect(manager.translateStroke("missing", [1, 1, 1])).toBe(false);
  });

  it("replaces a stroke's subset when it is re-committed after an edit", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey();
    manager.addStroke("a", key, makeArrays(4, 1));
    const first = manager.getLocation("a");
    manager.addStroke("a", key, makeArrays(6, 9));
    const second = manager.getLocation("a");

    expect(second).toBeDefined();
    expect(second?.subset).not.toBe(first?.subset);
    expect(second?.subset.vertexCount).toBe(6);
    // Exactly one live subset for the stroke — no duplicate left behind.
    const live = manager
      .getPools()
      .flatMap((pool) => pool.batches)
      .flatMap((batch) => batch.subsets)
      .filter((subset) => subset.strokeGuid === "a");
    expect(live).toHaveLength(1);
  });

  it("trims pools that no longer hold any strokes", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey();
    manager.addStroke("a", key, makeArrays(4, 1));
    manager.removeStroke("a");
    expect(manager.countBatches()).toBe(1);

    const removed = manager.trim();
    expect(removed).toHaveLength(1);
    expect(manager.countBatches()).toBe(0);
    expect(manager.getPools()).toHaveLength(0);
  });

  it("keys pools by the same string brush-batch planning uses", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey();
    manager.addStroke("a", key, makeArrays(4, 1));
    expect(stringifyBatchKey(manager.getPools()[0].key)).toBe(
      stringifyBatchKey(key),
    );
  });
});

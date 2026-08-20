import { describe, expect, it } from "vitest";

import type { StrokeData } from "../types.js";
import { translateStrokeDataControlPoints } from "../strokes/selection.js";
import type { BrushGeometryArrays } from "./brush-geometry.js";
import type { BrushBatchKey } from "./brush-batching.js";
import { StrokeBatchManager } from "./stroke-batch-manager.js";

describe("batched stroke editing lifecycle", () => {
  it("moves and undoes selected strokes across brush and layer batches", () => {
    const manager = new StrokeBatchManager();
    const firstData = makeStrokeData("first", "brush-a", 0, [1, 2, 3]);
    const secondData = makeStrokeData("second", "brush-b", 2, [-2, 0, 4]);
    manager.addStroke("first", makeKey("brush-a", 0), makeArrays(1));
    manager.addStroke("second", makeKey("brush-b", 2), makeArrays(-2));

    for (const guid of ["first", "second"]) {
      manager.setStrokeVisible(guid, false);
    }
    expect(manager.getLocation("first")?.subset.active).toBe(false);
    expect(manager.getLocation("second")?.subset.active).toBe(false);

    const delta: [number, number, number] = [0.5, -1, 2];
    manager.translateStroke("first", delta);
    manager.translateStroke("second", delta);
    translateStrokeDataControlPoints(firstData, delta);
    translateStrokeDataControlPoints(secondData, delta);
    manager.setStrokeVisible("first", true);
    manager.setStrokeVisible("second", true);

    expect(firstData.controlPoints[0].position).toEqual([1.5, 1, 5]);
    expect(secondData.controlPoints[0].position).toEqual([-1.5, -1, 6]);
    expect(firstPosition(manager, "first")).toEqual([1.5, 2.5, 3.5]);
    expect(firstPosition(manager, "second")).toEqual([-1.5, -0.5, 0.5]);

    const undo: [number, number, number] = [
      -delta[0],
      -delta[1],
      -delta[2],
    ];
    manager.translateStroke("first", undo);
    manager.translateStroke("second", undo);
    translateStrokeDataControlPoints(firstData, undo);
    translateStrokeDataControlPoints(secondData, undo);

    expect(firstData.controlPoints[0].position).toEqual([1, 2, 3]);
    expect(secondData.controlPoints[0].position).toEqual([-2, 0, 4]);
    expect(firstPosition(manager, "first")).toEqual([1, 3.5, 1.5]);
    expect(firstPosition(manager, "second")).toEqual([-2, 0.5, -1.5]);
  });

  it("deletes one selected subset without losing another stroke's visibility", () => {
    const manager = new StrokeBatchManager();
    const key = makeKey("brush-a", 0);
    manager.addStroke("keep", key, makeArrays(1));
    manager.addStroke("delete", key, makeArrays(5));

    manager.setStrokeVisible("keep", false);
    manager.setStrokeVisible("delete", false);
    expect(manager.removeStroke("delete")).toBe(true);
    manager.setStrokeVisible("keep", true);

    expect(manager.getLocation("delete")).toBeUndefined();
    expect(manager.getLocation("keep")?.subset.active).toBe(true);
    expect(manager.countStrokes()).toBe(1);
  });
});

function makeKey(brushGuid: string, layerIndex: number): BrushBatchKey {
  return {
    layerIndex,
    brushGuid,
    geometryFamily: "ribbon",
    materialFamily: "standard",
    transparent: false,
    materialMode: "managed-shader",
    renderPassContract: "single",
    supplementalAttributeContract: "none",
    materialInstanceKey: brushGuid,
  };
}

function makeArrays(seed: number): BrushGeometryArrays {
  return {
    positions: new Float32Array([seed, seed + 2.5, seed + 0.5]),
    normals: new Float32Array([0, 1, 0]),
    tangents: new Float32Array([1, 0, 0, 1]),
    colors: new Float32Array([1, 1, 1, 1]),
    uvs: new Float32Array([0, 0]),
    packedUvs: new Float32Array(3),
    particleUvs: new Float32Array(4),
    vectorUvs: new Float32Array(3),
    uv1s: new Float32Array(4),
    uv0Size: 2,
    uv1Size: 0,
    indices: new Uint32Array([0, 0, 0]),
    vertexCount: 1,
    indexCount: 3,
    bounds: {
      min: [seed, seed + 2.5, seed + 0.5],
      max: [seed, seed + 2.5, seed + 0.5],
    },
  } as BrushGeometryArrays;
}

function makeStrokeData(
  guid: string,
  brushGuid: string,
  layerIndex: number,
  position: [number, number, number],
): StrokeData {
  return {
    guid,
    brushGuid,
    layerIndex,
    controlPoints: [{ position }],
  } as unknown as StrokeData;
}

function firstPosition(
  manager: StrokeBatchManager,
  guid: string,
): [number, number, number] {
  const location = manager.getLocation(guid)!;
  const offset = location.subset.startVertex * 3;
  return [
    location.batch.positions[offset],
    location.batch.positions[offset + 1],
    location.batch.positions[offset + 2],
  ];
}

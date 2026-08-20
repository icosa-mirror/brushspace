import { BufferAttribute, BufferGeometry, MeshBasicMaterial } from "@iwsdk/core";
import { describe, expect, it, vi } from "vitest";

import type { BrushGeometryArrays } from "./brush-geometry.js";
import {
  uploadStrokeBatchGeometry,
  uploadStrokeBatchSubsetGeometry,
} from "./stroke-batch-geometry.js";
import { StrokeBatch, type BatchVertexLayout } from "./stroke-batch.js";

const FLAT_BRUSH_GUID = "2d35bcf0-e4d8-452c-97b1-3311be063130";
const DANCE_FLOOR_BRUSH_GUID = "6a1cf9f9-032c-45ec-311e-a6680bee32e9";

vi.mock("@iwsdk/core", () => {
  class MockBufferAttribute {
    readonly count: number;
    usage = 0;
    needsUpdate = false;
    updateRanges: Array<{ start: number; count: number }> = [];

    constructor(
      readonly array: Float32Array | Uint32Array,
      readonly itemSize: number,
    ) {
      this.count = array.length / itemSize;
    }

    setUsage(usage: number) {
      this.usage = usage;
      return this;
    }

    clearUpdateRanges() {
      this.updateRanges.length = 0;
    }

    addUpdateRange(start: number, count: number) {
      this.updateRanges.push({ start, count });
    }
  }

  class MockVector3 {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}

    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }

    toArray() {
      return [this.x, this.y, this.z];
    }
  }

  class MockBox3 {
    min = new MockVector3(Infinity, Infinity, Infinity);
    max = new MockVector3(-Infinity, -Infinity, -Infinity);

    makeEmpty() {
      this.min.set(Infinity, Infinity, Infinity);
      this.max.set(-Infinity, -Infinity, -Infinity);
      return this;
    }

    expandByPoint(point: MockVector3) {
      this.min.set(
        Math.min(this.min.x, point.x),
        Math.min(this.min.y, point.y),
        Math.min(this.min.z, point.z),
      );
      this.max.set(
        Math.max(this.max.x, point.x),
        Math.max(this.max.y, point.y),
        Math.max(this.max.z, point.z),
      );
      return this;
    }

    isEmpty() {
      return this.max.x < this.min.x;
    }

    getBoundingSphere(sphere: MockSphere) {
      sphere.center.set(
        (this.min.x + this.max.x) * 0.5,
        (this.min.y + this.max.y) * 0.5,
        (this.min.z + this.max.z) * 0.5,
      );
      sphere.radius = Math.hypot(
        this.max.x - sphere.center.x,
        this.max.y - sphere.center.y,
        this.max.z - sphere.center.z,
      );
      return sphere;
    }
  }

  class MockSphere {
    center = new MockVector3();
    radius = 0;
  }

  class MockBufferGeometry {
    private readonly attributes = new Map<string, MockBufferAttribute>();
    private index?: MockBufferAttribute;
    groups: Array<{ start: number; count: number; materialIndex: number }> = [];
    drawRange = { start: 0, count: Infinity };
    boundingBox?: MockBox3;
    boundingSphere?: MockSphere;

    getAttribute(name: string) {
      return this.attributes.get(name);
    }

    setAttribute(name: string, attribute: MockBufferAttribute) {
      this.attributes.set(name, attribute);
      return this;
    }

    deleteAttribute(name: string) {
      this.attributes.delete(name);
      return this;
    }

    getIndex() {
      return this.index;
    }

    setIndex(index: MockBufferAttribute) {
      this.index = index;
      return this;
    }

    setDrawRange(start: number, count: number) {
      this.drawRange = { start, count };
    }

    clearGroups() {
      this.groups.length = 0;
    }

    addGroup(start: number, count: number, materialIndex: number) {
      this.groups.push({ start, count, materialIndex });
    }
  }

  return {
    Box3: MockBox3,
    BufferAttribute: MockBufferAttribute,
    BufferGeometry: MockBufferGeometry,
    DynamicDrawUsage: 35048,
    MeshBasicMaterial: class {},
    Sphere: MockSphere,
    Vector3: MockVector3,
  };
});

vi.mock("./brush-render-material.js", () => ({
  applyBrushRenderGroups(
    geometry: BufferGeometry,
    indexCount: number,
    material: unknown | unknown[],
  ) {
    geometry.clearGroups();
    const passCount = Array.isArray(material) ? material.length : 1;
    for (let pass = 0; pass < passCount; pass += 1) {
      geometry.addGroup(0, indexCount, pass);
    }
  },
}));

vi.mock("./brush-shader-library.js", () => ({
  applyBrushShaderAttributeAliases(geometry: BufferGeometry) {
    for (const [standard, alias] of [
      ["position", "a_position"],
      ["normal", "a_normal"],
      ["tangent", "a_tangent"],
      ["color", "a_color"],
      ["uv", "a_texcoord0"],
      ["uv1", "a_texcoord1"],
    ]) {
      const attribute = geometry.getAttribute(standard);
      if (attribute) {
        geometry.setAttribute(alias, attribute);
      }
    }
  },
  applyBrushShaderSupplementalAttributes(
    geometry: BufferGeometry,
    brushGuid: string,
  ) {
    if (brushGuid !== DANCE_FLOOR_BRUSH_GUID) {
      return undefined;
    }
    const uv1 = geometry.getAttribute("a_texcoord1");
    if (!uv1) {
      return undefined;
    }
    const source = uv1.array as Float32Array;
    const timestamp = new Float32Array(uv1.count);
    for (let index = 0; index < uv1.count; index += 1) {
      timestamp[index] = source[index * uv1.itemSize + 3];
    }
    const result = new BufferAttribute(timestamp, 1);
    geometry.setAttribute("a_timestamp", result);
    return result;
  },
}));

describe("stroke batch geometry upload", () => {
  it("uploads concatenated attributes, aliases, indices, draw range, and bounds", () => {
    const batch = new StrokeBatch({ uv0Size: 3, uv1Size: 4 });
    batch.addSubset("first", makeArrays(4, 1, { uv0Size: 3, uv1Size: 4 }));
    batch.addSubset("second", makeArrays(4, 5, { uv0Size: 3, uv1Size: 4 }));
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();

    const result = uploadStrokeBatchGeometry(
      geometry,
      batch,
      DANCE_FLOOR_BRUSH_GUID,
      material,
    );

    expect(result.vertexDataUploaded).toBe(true);
    expect(result.topologyUploaded).toBe(true);
    expect(result.uploadedBytes).toBeGreaterThan(0);
    expect(geometry.getAttribute("uv").itemSize).toBe(2);
    expect(geometry.getAttribute("a_texcoord0").itemSize).toBe(3);
    expect(geometry.getAttribute("a_texcoord1").itemSize).toBe(4);
    expect(geometry.getAttribute("a_timestamp").itemSize).toBe(1);
    expect(geometry.getAttribute("a_position")).toBe(
      geometry.getAttribute("position"),
    );
    expect(geometry.getIndex()?.array).toBe(batch.indices);
    expect(geometry.drawRange).toEqual({ start: 0, count: batch.indexCount });
    expect(geometry.boundingBox?.min.toArray()).toEqual([1, 1, 1]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([6, 6, 6]);
    expect(batch.vertexDataDirty).toBe(false);
    expect(batch.topologyDirty).toBe(false);
  });

  it("updates only topology and active bounds when a subset is hidden", () => {
    const batch = new StrokeBatch({ uv0Size: 2, uv1Size: 0 });
    batch.addSubset("first", makeArrays(4, 1));
    const second = batch.addSubset("second", makeArrays(4, 5));
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();
    uploadStrokeBatchGeometry(geometry, batch, FLAT_BRUSH_GUID, material);
    const position = geometry.getAttribute("position");
    expect(geometry.getAttribute("uv1")).toBeUndefined();
    expect(geometry.getAttribute("a_texcoord1")).toBeUndefined();

    batch.disableSubset(second);
    const result = uploadStrokeBatchGeometry(
      geometry,
      batch,
      FLAT_BRUSH_GUID,
      material,
    );

    expect(result.vertexDataUploaded).toBe(false);
    expect(result.topologyUploaded).toBe(true);
    expect(geometry.getAttribute("position")).toBe(position);
    expect(geometry.boundingBox?.min.toArray()).toEqual([1, 1, 1]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([2, 2, 2]);
  });

  it("rebinds attributes after batch storage grows", () => {
    const batch = new StrokeBatch({ uv0Size: 2, uv1Size: 0 });
    batch.addSubset("small", makeArrays(4, 1));
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();
    uploadStrokeBatchGeometry(geometry, batch, FLAT_BRUSH_GUID, material);
    const oldPositions = geometry.getAttribute("position").array;

    batch.addSubset("large", makeArrays(2048, 5));
    uploadStrokeBatchGeometry(geometry, batch, FLAT_BRUSH_GUID, material);

    expect(geometry.getAttribute("position").array).toBe(batch.positions);
    expect(geometry.getAttribute("position").array).not.toBe(oldPositions);
  });

  it("reconstructs a local private mesh from a translated subset", () => {
    const batch = new StrokeBatch({ uv0Size: 2, uv1Size: 0 });
    batch.addSubset("first", makeArrays(4, 1));
    const second = batch.addSubset("second", makeArrays(4, 5));
    batch.translateSubset(second, [10, 20, 30]);
    batch.disableSubset(second);
    const geometry = new BufferGeometry();
    const material = new MeshBasicMaterial();

    uploadStrokeBatchSubsetGeometry(
      geometry,
      batch,
      second,
      FLAT_BRUSH_GUID,
      material,
      [10, 20, 30],
    );

    expect(
      Array.from(geometry.getAttribute("position").array.slice(0, 6)),
    ).toEqual([5000, 0, 0, 5001, 0, 0]);
    expect(Array.from(geometry.getIndex()!.array)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(geometry.boundingBox?.min.toArray()).toEqual([5, 5, 5]);
    expect(geometry.boundingBox?.max.toArray()).toEqual([6, 6, 6]);
  });

  it("creates one full-range render group per material pass", () => {
    const batch = new StrokeBatch({ uv0Size: 2, uv1Size: 0 });
    batch.addSubset("stroke", makeArrays(4, 1));
    const geometry = new BufferGeometry();
    const materials = [
      new MeshBasicMaterial(),
      new MeshBasicMaterial(),
      new MeshBasicMaterial(),
    ];

    uploadStrokeBatchGeometry(
      geometry,
      batch,
      FLAT_BRUSH_GUID,
      materials,
    );

    expect(geometry.groups).toEqual([
      { start: 0, count: batch.indexCount, materialIndex: 0 },
      { start: 0, count: batch.indexCount, materialIndex: 1 },
      { start: 0, count: batch.indexCount, materialIndex: 2 },
    ]);
  });
});

function makeArrays(
  vertices: number,
  seed: number,
  layout: BatchVertexLayout = { uv0Size: 2, uv1Size: 0 },
): BrushGeometryArrays {
  const indexCount = Math.max(0, (vertices - 2) * 3);
  const arrays = {
    positions: new Float32Array(vertices * 3),
    normals: new Float32Array(vertices * 3),
    tangents: new Float32Array(vertices * 4),
    colors: new Float32Array(vertices * 4),
    uvs: new Float32Array(vertices * 2),
    packedUvs: new Float32Array(vertices * 3),
    particleUvs: new Float32Array(vertices * 4),
    vectorUvs: new Float32Array(vertices * 3),
    uv1s: new Float32Array(vertices * 4),
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

  for (let vertex = 0; vertex < vertices; vertex += 1) {
    arrays.positions[vertex * 3] = seed * 1000 + vertex;
    arrays.uvs[vertex * 2] = vertex;
    arrays.packedUvs[vertex * 3] = vertex;
    arrays.uv1s[vertex * 4 + 3] = seed + vertex;
  }
  for (let triangle = 0; triangle < vertices - 2; triangle += 1) {
    arrays.indices[triangle * 3] = 0;
    arrays.indices[triangle * 3 + 1] = triangle + 1;
    arrays.indices[triangle * 3 + 2] = triangle + 2;
  }
  return arrays;
}

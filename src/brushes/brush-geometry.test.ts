import { describe, expect, it } from "vitest";

import referenceManifest from "./generated/exportManifest.json";
import generatedBrushAssets from "./generated/brush-assets.json";

import {
  buildBrushInventoryFromExportManifest,
  findBrushByGuid,
  type BrushAssetRecord,
  type OpenBrushExportManifest,
} from "./brush-inventory.js";
import {
  generateBrushGeometry,
  getGeneratedIndexCount,
  getGeneratedVertexCount,
} from "./brush-geometry.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import type { StrokeData } from "../types.js";

const inventory = buildBrushInventoryFromExportManifest(
  referenceManifest as unknown as OpenBrushExportManifest,
  generatedBrushAssets.brushes as unknown as Record<string, BrushAssetRecord>,
);
const fixtureStroke = createPhase1FixtureDocument().strokes[0];

describe("brush geometry generation", () => {
  it("generates stable ribbon geometry for marker strokes", () => {
    const geometry = generateBrushGeometry(fixtureStroke, "ribbon");

    expect(geometry.family).toBe("ribbon");
    expect(getGeneratedVertexCount(geometry)).toBe(6);
    expect(getGeneratedIndexCount(geometry)).toBe(12);
    expect(geometry.positions).toHaveLength(18);
    expect(geometry.normals).toHaveLength(18);
    expect(geometry.colors).toHaveLength(24);
    expect(geometry.uvs).toHaveLength(12);
    expect(geometry.bounds.min[0]).toBeLessThan(-0.2);
    expect(geometry.bounds.max[0]).toBeGreaterThan(0.2);
  });

  it("expands generated bounds by visible ribbon width", () => {
    const stroke: StrokeData = {
      guid: "wide-ribbon",
      brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
      brushSize: 0.2,
      brushScale: 1,
      color: [1, 1, 1, 1],
      layerIndex: 0,
      flags: 0,
      seed: 1,
      groupId: 1,
      controlPoints: [
        {
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
          pressure: 1,
          timestampMs: 0,
        },
        {
          position: [1, 0, 0],
          orientation: [0, 0, 0, 1],
          pressure: 1,
          timestampMs: 16,
        },
      ],
    };

    const geometry = generateBrushGeometry(stroke, "ribbon");

    // Identity pointer orientation (-Z forward) with an +X stroke widens the
    // ribbon along Y (ComputeSurfaceFrameNew: right = pointerForward x move).
    expect(geometry.bounds.min[0]).toBeCloseTo(0);
    expect(geometry.bounds.min[1]).toBeCloseTo(-0.1);
    expect(geometry.bounds.min[2]).toBeCloseTo(0);
    expect(geometry.bounds.max[0]).toBeCloseTo(1);
    expect(geometry.bounds.max[1]).toBeCloseTo(0.1);
    expect(geometry.bounds.max[2]).toBeCloseTo(0);
  });

  it("uses brush pressure-size minimum for low-pressure ribbon width", () => {
    const stroke = createTwoPointStroke({
      guid: "low-pressure-light",
      brushSize: 0.2,
      pressure: 0,
    });

    const geometry = generateBrushGeometry(stroke, "emissive", {
      pressureSizeRange: [0.15, 1],
    });

    expect(geometry.bounds.min[1]).toBeCloseTo(-0.015);
    expect(geometry.bounds.max[1]).toBeCloseTo(0.015);
  });

  it.each(["ribbon", "emissive", "tube", "particle"] as const)(
    "applies brush pressure-opacity range to %s vertex alpha",
    (family) => {
      const stroke = createTwoPointStroke({
        guid: `low-opacity-${family}`,
        brushSize: 0.2,
        pressure: 0.5,
      });

      const geometry = generateBrushGeometry(stroke, family, {
        pressureOpacityRange: [0.5, 1],
      });

      for (let index = 3; index < geometry.colors.length; index += 4) {
        expect(geometry.colors[index]).toBeCloseTo(0.75);
      }
    },
  );

  it("uses full width for brushes with fixed pressure size", () => {
    const stroke = createTwoPointStroke({
      guid: "fixed-pressure-flat",
      brushSize: 0.2,
      pressure: 0,
    });

    const geometry = generateBrushGeometry(stroke, "ribbon", {
      pressureSizeRange: [1, 1],
    });

    expect(geometry.bounds.min[1]).toBeCloseTo(-0.1);
    expect(geometry.bounds.max[1]).toBeCloseTo(0.1);
  });

  it("generates stable tube geometry", () => {
    const stroke = withBrushGuid(fixtureStroke, "8e58ceea-7830-49b4-aba9-6215104ab52a");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("tube");
    // 3 control points x 9 ring verts (8 sides + UV seam) + 2 cap centers.
    expect(getGeneratedVertexCount(geometry)).toBe(29);
    // 2 segments x 8 sides x 6 + 2 caps x 8 fan triangles x 3.
    expect(getGeneratedIndexCount(geometry)).toBe(144);
  });

  it("generates emissive geometry with ribbon topology", () => {
    const stroke = withBrushGuid(fixtureStroke, "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("emissive");
    expect(getGeneratedVertexCount(geometry)).toBe(6);
    expect(getGeneratedIndexCount(geometry)).toBe(12);
  });

  it("generates particle fallback quads per control point", () => {
    const stroke = withBrushGuid(fixtureStroke, "70d79cca-b159-4f35-990c-f02193947fe8");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("particle");
    expect(getGeneratedVertexCount(geometry)).toBe(12);
    expect(getGeneratedIndexCount(geometry)).toBe(18);
  });

  it("creates fallback geometry and warning for unsupported brushes", () => {
    const stroke = withBrushGuid(fixtureStroke, "00000000-0000-0000-0000-000000000000");
    const geometry = generateBrushGeometry(stroke, "unsupported");

    expect(geometry.family).toBe("unsupported");
    expect(geometry.warning).toContain("fallback ribbon");
    expect(getGeneratedVertexCount(geometry)).toBe(6);
  });

  it("keeps ribbon frames continuous on a coil (no flips or snaps)", () => {
    const controlPoints = [];
    const turns = 2;
    const count = 60;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / (count - 1)) * turns * Math.PI * 2;
      controlPoints.push({
        position: [
          Math.cos(angle) * 0.2,
          1 + (i / (count - 1)) * 0.3,
          -0.5 + Math.sin(angle) * 0.2,
        ] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
        pressure: 1,
        timestampMs: i * 16,
      });
    }
    const stroke: StrokeData = {
      guid: "coil",
      brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
      brushSize: 0.02,
      brushScale: 1,
      color: [1, 1, 1, 1],
      layerIndex: 0,
      flags: 0,
      seed: 1,
      groupId: 1,
      controlPoints,
    };

    const geometry = generateBrushGeometry(stroke, "ribbon");
    // Width direction at each point = right vertex minus left vertex.
    let previous: [number, number, number] | undefined;
    for (let i = 0; i < count; i += 1) {
      const left = i * 2 * 3;
      const right = (i * 2 + 1) * 3;
      const dir: [number, number, number] = [
        geometry.positions[right] - geometry.positions[left],
        geometry.positions[right + 1] - geometry.positions[left + 1],
        geometry.positions[right + 2] - geometry.positions[left + 2],
      ];
      const length = Math.hypot(dir[0], dir[1], dir[2]);
      expect(length).toBeGreaterThan(0.02 * 0.5); // never collapses
      if (previous) {
        const dot =
          (dir[0] * previous[0] + dir[1] * previous[1] + dir[2] * previous[2]) /
          (length * Math.hypot(previous[0], previous[1], previous[2]));
        // Adjacent frames stay continuous — the old XZ-planar offset snapped
        // when the coil tangent went vertical.
        expect(dot).toBeGreaterThan(0.7);
      }
      previous = dir;
    }
  });

  it("transports tube ring frames without spinning on a coil", () => {
    const controlPoints = [];
    const count = 40;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / (count - 1)) * Math.PI * 2;
      controlPoints.push({
        position: [
          Math.cos(angle) * 0.2,
          1 + (i / (count - 1)) * 0.2,
          -0.5 + Math.sin(angle) * 0.2,
        ] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
        pressure: 1,
        timestampMs: i * 16,
      });
    }
    const stroke: StrokeData = {
      guid: "tube-coil",
      brushGuid: "8e58ceea-7830-49b4-aba9-6215104ab52a",
      brushSize: 0.02,
      brushScale: 1,
      color: [1, 1, 1, 1],
      layerIndex: 0,
      flags: 0,
      seed: 1,
      groupId: 1,
      controlPoints,
    };

    const geometry = generateBrushGeometry(stroke, "tube");
    const ringVerts = 9;
    let previous: [number, number, number] | undefined;
    for (let i = 0; i < count; i += 1) {
      const center = stroke.controlPoints[i].position;
      const v0 = i * ringVerts * 3;
      const radial: [number, number, number] = [
        geometry.positions[v0] - center[0],
        geometry.positions[v0 + 1] - center[1],
        geometry.positions[v0 + 2] - center[2],
      ];
      const length = Math.hypot(radial[0], radial[1], radial[2]);
      expect(length).toBeCloseTo(0.01, 3); // radius = brushSize / 2
      if (previous) {
        const dot =
          (radial[0] * previous[0] +
            radial[1] * previous[1] +
            radial[2] * previous[2]) /
          (length * Math.hypot(previous[0], previous[1], previous[2]));
        expect(dot).toBeGreaterThan(0.9); // parallel transport: no ring spin
      }
      previous = radial;
    }
  });

});

function withBrushGuid(stroke: StrokeData, brushGuid: string): StrokeData {
  return {
    ...stroke,
    brushGuid,
    guid: `${stroke.guid}-${brushGuid.slice(0, 8)}`,
  };
}

function createTwoPointStroke({
  guid,
  brushSize,
  pressure,
}: {
  guid: string;
  brushSize: number;
  pressure: number;
}): StrokeData {
  return {
    guid,
    brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
    brushSize,
    brushScale: 1,
    color: [1, 1, 1, 1],
    layerIndex: 0,
    flags: 0,
    seed: 1,
    groupId: 1,
    controlPoints: [
      {
        position: [0, 0, 0],
        orientation: [0, 0, 0, 1],
        pressure,
        timestampMs: 0,
      },
      {
        position: [1, 0, 0],
        orientation: [0, 0, 0, 1],
        pressure,
        timestampMs: 16,
      },
    ],
  };
}

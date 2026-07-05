import { describe, expect, it } from "vitest";

import referenceManifest from "../../reference/Support/exportManifest.json";

import {
  buildBrushInventoryFromExportManifest,
  findBrushByGuid,
  type OpenBrushExportManifest,
} from "./brush-inventory.js";
import {
  generateBrushGeometry,
  getGeneratedIndexCount,
  getGeneratedVertexCount,
} from "./brush-geometry.js";
import { createPhase1FixtureDocument } from "./fixtures.js";
import type { StrokeData } from "./types.js";

const inventory = buildBrushInventoryFromExportManifest(
  referenceManifest as unknown as OpenBrushExportManifest,
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

    expect(geometry.bounds.min[0]).toBeCloseTo(0);
    expect(geometry.bounds.min[1]).toBeCloseTo(0);
    expect(geometry.bounds.min[2]).toBeCloseTo(-0.1);
    expect(geometry.bounds.max[0]).toBeCloseTo(1);
    expect(geometry.bounds.max[1]).toBeCloseTo(0);
    expect(geometry.bounds.max[2]).toBeCloseTo(0.1);
  });

  it("generates stable tube geometry", () => {
    const stroke = withBrushGuid(fixtureStroke, "8e58ceea-7830-49b4-aba9-6215104ab52a");
    const family = findBrushByGuid(inventory, stroke.brushGuid)?.geometryFamily;

    const geometry = generateBrushGeometry(stroke, family ?? "unsupported");

    expect(geometry.family).toBe("tube");
    expect(getGeneratedVertexCount(geometry)).toBe(12);
    expect(getGeneratedIndexCount(geometry)).toBe(48);
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
});

function withBrushGuid(stroke: StrokeData, brushGuid: string): StrokeData {
  return {
    ...stroke,
    brushGuid,
    guid: `${stroke.guid}-${brushGuid.slice(0, 8)}`,
  };
}

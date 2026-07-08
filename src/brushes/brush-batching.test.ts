import { describe, expect, it } from "vitest";

import referenceManifest from "./generated/exportManifest.json";
import generatedBrushAssets from "./generated/brush-assets.json";

import {
  buildBrushInventoryFromExportManifest,
  type BrushAssetRecord,
  type OpenBrushExportManifest,
} from "./brush-inventory.js";
import { planBrushBatches, stringifyBatchKey } from "./brush-batching.js";
import { generateBrushGeometry } from "./brush-geometry.js";
import { createPhase1FixtureDocument } from "../sketch/fixtures.js";
import type { StrokeData } from "../types.js";

const inventory = buildBrushInventoryFromExportManifest(
  referenceManifest as unknown as OpenBrushExportManifest,
  generatedBrushAssets.brushes as unknown as Record<string, BrushAssetRecord>,
);
const fixtureStroke = createPhase1FixtureDocument().strokes[0];

describe("brush batch planning", () => {
  it("groups compatible strokes while preserving hidden stroke membership", () => {
    const first = withOverrides(fixtureStroke, { guid: "stroke-a" });
    const second = withOverrides(fixtureStroke, { guid: "stroke-b" });
    const firstGeometry = generateBrushGeometry(first, "ribbon");
    const secondGeometry = generateBrushGeometry(second, "ribbon");

    const batches = planBrushBatches(
      [
        {
          stroke: first,
          vertexCount: firstGeometry.positions.length / 3,
          indexCount: firstGeometry.indices.length,
        },
        {
          stroke: second,
          vertexCount: secondGeometry.positions.length / 3,
          indexCount: secondGeometry.indices.length,
          visible: false,
        },
      ],
      inventory,
    );

    expect(batches).toHaveLength(1);
    expect(batches[0].strokeGuids).toEqual(["stroke-a", "stroke-b"]);
    expect(batches[0].visibleStrokeCount).toBe(1);
    expect(batches[0].vertexCount).toBe(12);
    expect(batches[0].indexCount).toBe(24);
  });

  it("splits batches by layer", () => {
    const first = withOverrides(fixtureStroke, { guid: "stroke-a", layerIndex: 0 });
    const second = withOverrides(fixtureStroke, { guid: "stroke-b", layerIndex: 1 });

    const batches = planBrushBatches(
      [
        { stroke: first, vertexCount: 6, indexCount: 12 },
        { stroke: second, vertexCount: 6, indexCount: 12 },
      ],
      inventory,
    );

    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.key.layerIndex)).toEqual([0, 1]);
  });

  it("marks additive and particle batches as transparent", () => {
    const light = withOverrides(fixtureStroke, {
      guid: "light",
      brushGuid: "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62",
    });
    const particle = withOverrides(fixtureStroke, {
      guid: "particle",
      brushGuid: "70d79cca-b159-4f35-990c-f02193947fe8",
    });

    const batches = planBrushBatches(
      [
        { stroke: light, vertexCount: 6, indexCount: 12 },
        { stroke: particle, vertexCount: 12, indexCount: 18 },
      ],
      inventory,
    );

    expect(batches.every((batch) => batch.key.transparent)).toBe(true);
    expect(batches.map((batch) => stringifyBatchKey(batch.key))).toEqual([
      "0|2241cd32-8ba2-48a5-9ee7-2caef7e9ed62|emissive|additive|transparent|emissive:additive",
      "0|70d79cca-b159-4f35-990c-f02193947fe8|particle|particle|transparent|particle:particle",
    ]);
  });

  it("keeps unsupported brushes in fallback batches with warnings", () => {
    const unsupported = withOverrides(fixtureStroke, {
      guid: "unsupported",
      brushGuid: "00000000-0000-0000-0000-000000000000",
    });

    const batches = planBrushBatches(
      [{ stroke: unsupported, vertexCount: 6, indexCount: 12 }],
      inventory,
    );

    expect(batches).toHaveLength(1);
    expect(batches[0].key.geometryFamily).toBe("unsupported");
    expect(batches[0].key.materialFamily).toBe("fallback");
    expect(batches[0].warning).toContain("not been mapped");
  });
});

function withOverrides(
  stroke: StrokeData,
  overrides: Partial<StrokeData>,
): StrokeData {
  return {
    ...stroke,
    ...overrides,
  };
}

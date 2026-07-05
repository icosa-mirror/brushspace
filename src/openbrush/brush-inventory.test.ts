import { describe, expect, it } from "vitest";

import referenceManifest from "../../reference/Support/exportManifest.json";
import {
  buildBrushInventoryFromExportManifest,
  findBrushByGuid,
  summarizeBrushInventory,
  type OpenBrushExportManifest,
} from "./brush-inventory.js";

function loadReferenceManifest(): OpenBrushExportManifest {
  return referenceManifest as unknown as OpenBrushExportManifest;
}

describe("Open Brush brush inventory", () => {
  it("builds an inventory from the real Open Brush export manifest", () => {
    const inventory = buildBrushInventoryFromExportManifest(loadReferenceManifest());
    const summary = summarizeBrushInventory(inventory);

    expect(summary.total).toBe(123);
    expect(summary.supported).toBe(4);
    expect(summary.fallback).toBe(1);
    expect(summary.unsupported).toBe(118);
  });

  it("marks the initial MVP brush families explicitly", () => {
    const inventory = buildBrushInventoryFromExportManifest(loadReferenceManifest());

    expect(
      findBrushByGuid(inventory, "429ed64a-4e97-4466-84d3-145a861ef684"),
    ).toMatchObject({
      name: "Marker",
      supportStatus: "supported",
      geometryFamily: "ribbon",
      materialFamily: "standard",
      brushSizeRange: [0.05, 3],
      pressureSizeRange: [0.1, 1],
      pressureOpacityRange: [1, 1],
    });
    expect(
      findBrushByGuid(inventory, "2d35bcf0-e4d8-452c-97b1-3311be063130"),
    ).toMatchObject({
      name: "Flat",
      supportStatus: "supported",
      geometryFamily: "ribbon",
      brushSizeRange: [0.025, 3],
      pressureSizeRange: [1, 1],
      pressureOpacityRange: [1, 1],
    });
    expect(
      findBrushByGuid(inventory, "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62"),
    ).toMatchObject({
      name: "Light",
      supportStatus: "supported",
      geometryFamily: "emissive",
      materialFamily: "additive",
      brushSizeRange: [0.05, 0.2],
      pressureSizeRange: [0.15, 1],
      pressureOpacityRange: [0.5, 1],
    });
    expect(
      findBrushByGuid(inventory, "8e58ceea-7830-49b4-aba9-6215104ab52a"),
    ).toMatchObject({
      name: "MylarTube",
      supportStatus: "supported",
      geometryFamily: "tube",
      brushSizeRange: [0.08, 1],
      pressureSizeRange: [0.25, 1],
      pressureOpacityRange: [1, 1],
    });
    expect(
      findBrushByGuid(inventory, "70d79cca-b159-4f35-990c-f02193947fe8"),
    ).toMatchObject({
      name: "Smoke",
      supportStatus: "fallback",
      geometryFamily: "particle",
      brushSizeRange: [1, 2],
      pressureSizeRange: [0.2, 1],
      pressureOpacityRange: [1, 1],
    });
  });

  it("rejects manifest entries whose map key does not match their brush GUID", () => {
    expect(() =>
      buildBrushInventoryFromExportManifest({
        brushes: {
          "00000000-0000-0000-0000-000000000000": {
            guid: "11111111-1111-1111-1111-111111111111",
            name: "Broken",
            folderName: "Broken",
            shaderVersion: "0",
            blendMode: 0,
            enableCull: false,
          },
        },
      }),
    ).toThrow(/does not match/);
  });
});

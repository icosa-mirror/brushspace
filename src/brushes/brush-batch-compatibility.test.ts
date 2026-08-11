import { describe, expect, it } from "vitest";

import { openBrushInventory } from "./brush-catalog.js";
import type { BrushInventoryEntry } from "./brush-inventory.js";
import {
  auditBrushBatchCompatibility,
  resolveBrushBatchRuntimeEligibility,
} from "./brush-batch-compatibility.js";
import {
  ELECTRICITY_BRUSH_GUID,
  TOON_BRUSH_GUID,
  TUBE_TOON_INVERTED_BRUSH_GUID,
} from "./brush-render-material.js";

const FLAT_BRUSH_GUID = "2d35bcf0-e4d8-452c-97b1-3311be063130";
const DANCE_FLOOR_BRUSH_GUID =
  "6a1cf9f9-032c-45ec-311e-a6680bee32e9";
const LEAKY_PEN_BRUSH_GUID =
  "ddda8745-4bb5-ac54-88b6-d1480370583e";

describe("brush batch compatibility audit", () => {
  it("classifies every currently supported inventory brush as managed-material batchable", () => {
    const supported = openBrushInventory.filter(
      (entry) => entry.supportStatus === "supported",
    );
    expect(supported.length).toBeGreaterThan(0);
    for (const entry of supported) {
      expect(
        auditBrushBatchCompatibility(entry),
        `unexpected compatibility result for ${entry.name} (${entry.guid})`,
      ).toMatchObject({ batchableWithManagedMaterial: true });
    }
  });

  it("accepts a supported single-pass brush with entry-level render state", () => {
    const contract = auditBrushBatchCompatibility(getBrush(FLAT_BRUSH_GUID));

    expect(contract).toMatchObject({
      batchableWithManagedMaterial: true,
      renderPassContract: "single",
      expectedDrawCalls: 1,
      supplementalAttributeContract: "none",
      blending: "opaque",
      transparent: false,
      depthWrite: true,
    });
  });

  it.each([
    [ELECTRICITY_BRUSH_GUID, "electricity-3", 3],
    [TOON_BRUSH_GUID, "toon-2", 2],
    [TUBE_TOON_INVERTED_BRUSH_GUID, "tube-toon-inverted-2", 2],
  ] as const)(
    "records the material pass contract for %s",
    (guid, renderPassContract, expectedDrawCalls) => {
      expect(auditBrushBatchCompatibility(getBrush(guid))).toMatchObject({
        renderPassContract,
        expectedDrawCalls,
      });
    },
  );

  it("records brush-specific supplemental attribute work", () => {
    expect(
      auditBrushBatchCompatibility(getBrush(LEAKY_PEN_BRUSH_GUID))
        .supplementalAttributeContract,
    ).toBe("texcoord0-as-texcoord1");
    expect(
      auditBrushBatchCompatibility(getBrush(DANCE_FLOOR_BRUSH_GUID))
        .supplementalAttributeContract,
    ).toBe("uv1-w-as-timestamp");
  });

  it("keeps fallback and missing brushes on per-stroke rendering", () => {
    const fallback = {
      ...getBrush(FLAT_BRUSH_GUID),
      supportStatus: "fallback" as const,
      materialFamily: "fallback" as const,
    };
    expect(auditBrushBatchCompatibility(fallback)).toMatchObject({
      batchableWithManagedMaterial: false,
    });
    expect(auditBrushBatchCompatibility(undefined)).toMatchObject({
      batchableWithManagedMaterial: false,
      reason: "Brush is missing from the Open Brush inventory.",
    });
  });

  it("requires the shared shader material to be loaded at runtime", () => {
    const flat = getBrush(FLAT_BRUSH_GUID);
    expect(resolveBrushBatchRuntimeEligibility(flat, false)).toMatchObject({
      eligible: false,
      reason: "Managed brush shader material is not loaded yet.",
    });
    expect(resolveBrushBatchRuntimeEligibility(flat, true)).toMatchObject({
      eligible: true,
    });
  });
});

function getBrush(guid: string): BrushInventoryEntry {
  const entry = openBrushInventory.find(
    (candidate) => candidate.guid.toLowerCase() === guid.toLowerCase(),
  );
  expect(entry, `missing inventory brush ${guid}`).toBeDefined();
  return entry!;
}

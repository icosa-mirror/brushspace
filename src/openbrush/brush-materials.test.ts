import { describe, expect, it } from "vitest";

import { createBrushMaterialSpec } from "./brush-materials.js";
import type { BrushInventoryEntry } from "./brush-inventory.js";

describe("brush material specs", () => {
  it("keeps opaque standard brushes depth-writing", () => {
    const spec = createBrushMaterialSpec(entry("standard"), [1, 0, 0, 1]);

    expect(spec.materialFamily).toBe("standard");
    expect(spec.blending).toBe("normal");
    expect(spec.transparent).toBe(false);
    expect(spec.depthWrite).toBe(true);
    expect(spec.vertexColors).toBe(true);
  });

  it("makes alpha standard brushes transparent", () => {
    const spec = createBrushMaterialSpec(entry("standard"), [1, 0, 0, 0.5]);

    expect(spec.transparent).toBe(true);
    expect(spec.depthWrite).toBe(false);
  });

  it("maps additive brushes to transparent additive material policy", () => {
    const spec = createBrushMaterialSpec(entry("additive"), [1, 1, 1, 1]);

    expect(spec.blending).toBe("additive");
    expect(spec.transparent).toBe(true);
    expect(spec.depthWrite).toBe(false);
  });

  it("keeps particle brushes transparent and double sided", () => {
    const spec = createBrushMaterialSpec(entry("particle"), [1, 1, 1, 1]);

    expect(spec.transparent).toBe(true);
    expect(spec.doubleSided).toBe(true);
    expect(spec.depthWrite).toBe(false);
  });

  it("warns for missing inventory entries", () => {
    const spec = createBrushMaterialSpec(undefined, [1, 1, 1, 1]);

    expect(spec.materialFamily).toBe("fallback");
    expect(spec.warning).toContain("missing");
  });
});

function entry(
  materialFamily: BrushInventoryEntry["materialFamily"],
): BrushInventoryEntry {
  return {
    guid: `${materialFamily}-guid`,
    name: materialFamily,
    folderName: materialFamily,
    shaderVersion: "1",
    blendMode: 0,
    enableCull: false,
    supportStatus: "supported",
    geometryFamily: materialFamily === "particle" ? "particle" : "ribbon",
    materialFamily,
  };
}

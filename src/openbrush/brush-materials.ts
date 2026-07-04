import type { BrushInventoryEntry, BrushMaterialFamily } from "./brush-inventory.js";
import type { Rgba } from "./types.js";

export type BrushBlendingMode = "normal" | "additive";

export interface BrushMaterialSpec {
  materialFamily: BrushMaterialFamily;
  blending: BrushBlendingMode;
  transparent: boolean;
  depthWrite: boolean;
  doubleSided: boolean;
  vertexColors: boolean;
  warning?: string;
}

export function createBrushMaterialSpec(
  entry: BrushInventoryEntry | undefined,
  color: Rgba,
): BrushMaterialSpec {
  if (!entry) {
    return {
      materialFamily: "fallback",
      blending: "normal",
      transparent: color[3] < 1,
      depthWrite: color[3] >= 1,
      doubleSided: true,
      vertexColors: true,
      warning: "Brush is missing from the Open Brush inventory; using fallback material.",
    };
  }

  const base = createFamilyMaterialSpec(entry.materialFamily, color);
  if (entry.supportStatus === "unsupported") {
    base.warning =
      entry.unsupportedReason ??
      "Brush material is not supported yet; using fallback material.";
  }
  return base;
}

function createFamilyMaterialSpec(
  family: BrushMaterialFamily,
  color: Rgba,
): BrushMaterialSpec {
  switch (family) {
    case "additive":
      return {
        materialFamily: family,
        blending: "additive",
        transparent: true,
        depthWrite: false,
        doubleSided: true,
        vertexColors: true,
      };
    case "particle":
      return {
        materialFamily: family,
        blending: "normal",
        transparent: true,
        depthWrite: false,
        doubleSided: true,
        vertexColors: true,
      };
    case "fallback":
      return {
        materialFamily: family,
        blending: "normal",
        transparent: color[3] < 1,
        depthWrite: color[3] >= 1,
        doubleSided: true,
        vertexColors: true,
        warning: "Brush uses fallback material.",
      };
    case "standard":
    case "unlit":
      return {
        materialFamily: family,
        blending: "normal",
        transparent: color[3] < 1,
        depthWrite: color[3] >= 1,
        doubleSided: true,
        vertexColors: true,
      };
  }
}

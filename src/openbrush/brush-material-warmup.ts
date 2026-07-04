import type {
  BrushInventoryEntry,
  BrushMaterialFamily,
  BrushSupportStatus,
} from "./brush-inventory.js";
import {
  createBrushMaterialSpec,
  type BrushBlendingMode,
  type BrushMaterialSpec,
} from "./brush-materials.js";
import type { Rgba } from "./types.js";

export interface BrushMaterialWarmupVariant {
  key: string;
  materialFamily: BrushMaterialFamily;
  blending: BrushBlendingMode;
  transparent: boolean;
  depthWrite: boolean;
  doubleSided: boolean;
  vertexColors: boolean;
  alphaCutoff: number;
  textureSlotCount: number;
  brushGuids: string[];
}

export interface BrushMaterialWarmupPlan {
  variants: BrushMaterialWarmupVariant[];
  supportedBrushCount: number;
  fallbackBrushCount: number;
  unsupportedBrushCount: number;
  transparentVariantCount: number;
  warnings: string[];
}

const DEFAULT_WARMUP_COLORS: readonly Rgba[] = [
  [1, 1, 1, 1],
  [1, 1, 1, 0.45],
];

export function createBrushMaterialWarmupPlan(
  entries: readonly BrushInventoryEntry[],
  colors: readonly Rgba[] = DEFAULT_WARMUP_COLORS,
): BrushMaterialWarmupPlan {
  const variants = new Map<string, BrushMaterialWarmupVariant>();
  const supportCounts: Record<BrushSupportStatus, number> = {
    supported: 0,
    fallback: 0,
    unsupported: 0,
  };
  const warnings: string[] = [];

  for (const entry of entries) {
    supportCounts[entry.supportStatus] += 1;
    if (entry.supportStatus !== "supported") {
      warnings.push(
        `${entry.guid}: ${
          entry.unsupportedReason ??
          "Brush material requires fallback warmup coverage."
        }`,
      );
    }
    for (const color of colors) {
      const spec = createBrushMaterialSpec(entry, color);
      const key = createWarmupVariantKey(spec);
      const existing = variants.get(key);
      if (existing) {
        if (!existing.brushGuids.includes(entry.guid)) {
          existing.brushGuids.push(entry.guid);
        }
        continue;
      }
      variants.set(key, {
        key,
        materialFamily: spec.materialFamily,
        blending: spec.blending,
        transparent: spec.transparent,
        depthWrite: spec.depthWrite,
        doubleSided: spec.doubleSided,
        vertexColors: spec.vertexColors,
        alphaCutoff: spec.alphaCutoff,
        textureSlotCount: spec.textureSlots.length,
        brushGuids: [entry.guid],
      });
    }
  }

  const sortedVariants = Array.from(variants.values())
    .map((variant) => ({
      ...variant,
      brushGuids: [...variant.brushGuids].sort(),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));

  return {
    variants: sortedVariants,
    supportedBrushCount: supportCounts.supported,
    fallbackBrushCount: supportCounts.fallback,
    unsupportedBrushCount: supportCounts.unsupported,
    transparentVariantCount: sortedVariants.filter(
      (variant) => variant.transparent,
    ).length,
    warnings,
  };
}

function createWarmupVariantKey(spec: BrushMaterialSpec): string {
  return [
    spec.materialFamily,
    spec.blending,
    spec.transparent ? "transparent" : "opaque",
    spec.depthWrite ? "depth-write" : "no-depth-write",
    spec.doubleSided ? "double-sided" : "single-sided",
    spec.vertexColors ? "vertex-colors" : "flat-color",
    `alpha:${spec.alphaCutoff}`,
    `textures:${spec.textureSlots.length}`,
  ].join("|");
}

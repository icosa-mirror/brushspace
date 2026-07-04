import { normalizeGuid } from "./binary.js";

export type BrushSupportStatus = "supported" | "fallback" | "unsupported";

export type BrushGeometryFamily =
  | "ribbon"
  | "tube"
  | "emissive"
  | "particle"
  | "unsupported";

export type BrushMaterialFamily =
  | "standard"
  | "unlit"
  | "additive"
  | "particle"
  | "fallback";

export interface OpenBrushExportManifest {
  tiltBrushVersion?: string;
  tiltBrushBuildStamp?: string;
  brushes: Record<string, OpenBrushExportBrush>;
}

export interface OpenBrushExportBrush {
  guid: string;
  name: string;
  folderName: string;
  shaderVersion: string;
  vertexShader?: string;
  fragmentShader?: string;
  blendMode: number;
  enableCull: boolean;
  textures?: Record<string, string>;
  textureSizes?: Record<string, [number, number]>;
  floatParams?: Record<string, number>;
  vectorParams?: Record<string, [number, number, number, number]>;
  colorParams?: Record<string, [number, number, number, number]>;
}

export interface BrushInventoryEntry extends OpenBrushExportBrush {
  supportStatus: BrushSupportStatus;
  geometryFamily: BrushGeometryFamily;
  materialFamily: BrushMaterialFamily;
  unsupportedReason?: string;
}

export interface BrushInventorySummary {
  total: number;
  supported: number;
  fallback: number;
  unsupported: number;
}

type BrushSupportDecision = Pick<
  BrushInventoryEntry,
  "supportStatus" | "geometryFamily" | "materialFamily" | "unsupportedReason"
>;

const MVP_BRUSH_SUPPORT: Record<string, BrushSupportDecision> = {
  "429ed64a-4e97-4466-84d3-145a861ef684": {
    supportStatus: "supported",
    geometryFamily: "ribbon",
    materialFamily: "standard",
  },
  "2d35bcf0-e4d8-452c-97b1-3311be063130": {
    supportStatus: "supported",
    geometryFamily: "ribbon",
    materialFamily: "unlit",
  },
  "2241cd32-8ba2-48a5-9ee7-2caef7e9ed62": {
    supportStatus: "supported",
    geometryFamily: "emissive",
    materialFamily: "additive",
  },
  "8e58ceea-7830-49b4-aba9-6215104ab52a": {
    supportStatus: "supported",
    geometryFamily: "tube",
    materialFamily: "standard",
  },
  "70d79cca-b159-4f35-990c-f02193947fe8": {
    supportStatus: "fallback",
    geometryFamily: "particle",
    materialFamily: "particle",
    unsupportedReason: "Particle brush geometry and shader semantics are deferred until batching is stable.",
  },
};

const DEFAULT_UNSUPPORTED: BrushSupportDecision = {
  supportStatus: "unsupported",
  geometryFamily: "unsupported",
  materialFamily: "fallback",
  unsupportedReason: "Brush has not been mapped to an IWSDK geometry/material family yet.",
};

export function buildBrushInventoryFromExportManifest(
  manifest: OpenBrushExportManifest,
): BrushInventoryEntry[] {
  const entries = Object.entries(manifest.brushes).map(([key, brush]) => {
    const guid = normalizeGuid(brush.guid);
    if (normalizeGuid(key) !== guid) {
      throw new Error(`Brush manifest key ${key} does not match brush guid ${brush.guid}`);
    }

    const support = MVP_BRUSH_SUPPORT[guid] ?? DEFAULT_UNSUPPORTED;
    return {
      ...brush,
      guid,
      supportStatus: support.supportStatus,
      geometryFamily: support.geometryFamily,
      materialFamily: support.materialFamily,
      unsupportedReason: support.unsupportedReason,
    };
  });

  entries.sort((a, b) => a.name.localeCompare(b.name) || a.guid.localeCompare(b.guid));
  return entries;
}

export function summarizeBrushInventory(
  entries: readonly BrushInventoryEntry[],
): BrushInventorySummary {
  const summary: BrushInventorySummary = {
    total: entries.length,
    supported: 0,
    fallback: 0,
    unsupported: 0,
  };

  for (const entry of entries) {
    summary[entry.supportStatus] += 1;
  }

  return summary;
}

export function findBrushByGuid(
  entries: readonly BrushInventoryEntry[],
  guid: string,
): BrushInventoryEntry | undefined {
  const normalized = normalizeGuid(guid);
  return entries.find((entry) => entry.guid === normalized);
}

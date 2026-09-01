import type { BrushInventoryEntry } from "./brush-inventory.js";
import {
  createBrushShaderMaterialDescriptor,
  getBrushShaderEligibility,
  type BrushShaderBlending,
} from "./brush-shader-materials.js";
import {
  ELECTRICITY_BRUSH_GUID,
  TOON_BRUSH_GUID,
  TUBE_TOON_INVERTED_BRUSH_GUID,
} from "./brush-render-material.js";

export type BrushBatchMaterialMode =
  | "managed-shader"
  | "per-stroke-fallback";

export type BrushBatchRenderPassContract =
  | "single"
  | "electricity-3"
  | "toon-2"
  | "tube-toon-inverted-2";

export type BrushBatchSupplementalAttributeContract =
  | "none"
  | "texcoord0-as-texcoord1"
  | "uv1-w-as-timestamp";

export interface BrushBatchCompatibilityContract {
  batchableWithManagedMaterial: boolean;
  reason?: string;
  renderPassContract: BrushBatchRenderPassContract;
  expectedDrawCalls: number;
  supplementalAttributeContract: BrushBatchSupplementalAttributeContract;
  blending?: BrushShaderBlending;
  transparent?: boolean;
  depthWrite?: boolean;
  doubleSided?: boolean;
}

export interface BrushBatchRuntimeEligibility {
  eligible: boolean;
  contract: BrushBatchCompatibilityContract;
  reason?: string;
}

const DANCE_FLOOR_BRUSH_GUID =
  "6a1cf9f9-032c-45ec-311e-a6680bee32e9";
const LEAKY_PEN_BRUSH_GUID =
  "ddda8745-4bb5-ac54-88b6-d1480370583e";

/**
 * Static audit of the render state that a future batch mesh must reproduce.
 *
 * A supported brush's real ShaderMaterial is cached once per brush GUID by
 * BrushShaderLibrary. Manifest uniforms and textures are therefore
 * brush-level, while time and lighting holders are shared frame-level state.
 * Stroke-varying color/opacity is generated into vertex colors. These
 * managed materials can be shared by a batch; the temporary MeshBasicMaterial
 * fallback cannot, because it is created per stroke and carries opacity.
 */
export function auditBrushBatchCompatibility(
  entry: BrushInventoryEntry | undefined,
): BrushBatchCompatibilityContract {
  const renderPassContract = resolveRenderPassContract(entry?.guid);
  const supplementalAttributeContract =
    resolveSupplementalAttributeContract(entry?.guid);
  const base = {
    renderPassContract,
    expectedDrawCalls: expectedDrawCalls(renderPassContract),
    supplementalAttributeContract,
  };

  if (!entry) {
    return {
      ...base,
      batchableWithManagedMaterial: false,
      reason: "Brush is missing from the Open Brush inventory.",
    };
  }
  if (entry.supportStatus !== "supported") {
    return {
      ...base,
      batchableWithManagedMaterial: false,
      reason:
        entry.unsupportedReason ??
        `Brush support status is ${entry.supportStatus}; keep its per-stroke fallback.`,
    };
  }

  const eligibility = getBrushShaderEligibility(entry);
  const descriptor = createBrushShaderMaterialDescriptor(entry);
  if (!eligibility.eligible || !descriptor) {
    return {
      ...base,
      batchableWithManagedMaterial: false,
      reason:
        eligibility.reason ??
        "Brush has no generated-geometry shader material contract.",
    };
  }

  return {
    ...base,
    batchableWithManagedMaterial: true,
    blending: descriptor.blending,
    transparent: descriptor.transparent,
    depthWrite: descriptor.depthWrite,
    doubleSided: descriptor.doubleSided,
  };
}

/** Runtime gate for committing a stroke to a batch. */
export function resolveBrushBatchRuntimeEligibility(
  entry: BrushInventoryEntry | undefined,
  managedMaterialLoaded: boolean,
): BrushBatchRuntimeEligibility {
  const contract = auditBrushBatchCompatibility(entry);
  if (!contract.batchableWithManagedMaterial) {
    return { eligible: false, contract, reason: contract.reason };
  }
  if (!managedMaterialLoaded) {
    return {
      eligible: false,
      contract,
      reason: "Managed brush shader material is not loaded yet.",
    };
  }
  return { eligible: true, contract };
}

function resolveRenderPassContract(
  brushGuid: string | undefined,
): BrushBatchRenderPassContract {
  const normalized = brushGuid?.toLowerCase();
  if (normalized === ELECTRICITY_BRUSH_GUID) {
    return "electricity-3";
  }
  if (normalized === TOON_BRUSH_GUID) {
    return "toon-2";
  }
  if (normalized === TUBE_TOON_INVERTED_BRUSH_GUID) {
    return "tube-toon-inverted-2";
  }
  return "single";
}

function resolveSupplementalAttributeContract(
  brushGuid: string | undefined,
): BrushBatchSupplementalAttributeContract {
  const normalized = brushGuid?.toLowerCase();
  if (normalized === LEAKY_PEN_BRUSH_GUID) {
    return "texcoord0-as-texcoord1";
  }
  if (normalized === DANCE_FLOOR_BRUSH_GUID) {
    return "uv1-w-as-timestamp";
  }
  return "none";
}

function expectedDrawCalls(contract: BrushBatchRenderPassContract): number {
  switch (contract) {
    case "electricity-3":
      return 3;
    case "toon-2":
    case "tube-toon-inverted-2":
      return 2;
    case "single":
      return 1;
  }
}

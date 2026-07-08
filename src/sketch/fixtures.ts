import referenceManifest from "../brushes/generated/exportManifest.json";
import generatedBrushAssets from "../brushes/generated/brush-assets.json";

import {
  buildBrushInventoryFromExportManifest,
  type BrushAssetRecord,
  summarizeBrushInventory,
  type BrushInventorySummary,
  type OpenBrushExportManifest,
} from "../brushes/brush-inventory.js";
import {
  createSketchDocument,
  createSketchLayer,
  summarizeSketchDocument,
  validateSketchDocument,
  type SketchDocument,
  type SketchDocumentSummary,
} from "./document.js";
import { readSketchMemory, writeSketchMemory } from "./sketch-memory.js";
import { StrokeFlags, createEmptyStrokeData } from "../types.js";

export const PHASE1_FIXTURE_BRUSH_GUID =
  "429ed64a-4e97-4466-84d3-145a861ef684";

export interface Phase1RuntimeSummary {
  inventory: BrushInventorySummary;
  fixture: SketchDocumentSummary;
  fixtureMemoryBytes: number;
  fixtureParseStatus: "round-trip-ok" | "invalid";
  fixtureValidationErrors: string[];
  activeBrushGuid: string;
}

export function createPhase1FixtureDocument(): SketchDocument {
  return createSketchDocument({
    layers: [
      createSketchLayer({ id: 0, name: "Sketch" }),
      createSketchLayer({ id: 1, name: "Reference", visible: false }),
    ],
    strokes: [
      createEmptyStrokeData({
        brushGuid: PHASE1_FIXTURE_BRUSH_GUID,
        brushSize: 0.42,
        brushScale: 1,
        color: [0.1, 0.45, 0.95, 1],
        flags: StrokeFlags.None,
        seed: 42,
        layerIndex: 0,
        guid: "11111111-2222-3333-4444-555555555555",
        controlPoints: [
          {
            position: [-0.2, 1.2, -1.1],
            orientation: [0, 0, 0, 1],
            pressure: 0.35,
            timestampMs: 100,
          },
          {
            position: [0, 1.25, -1.2],
            orientation: [0, 0.1, 0, 0.995],
            pressure: 0.65,
            timestampMs: 120,
          },
          {
            position: [0.2, 1.22, -1.3],
            orientation: [0, 0.2, 0, 0.98],
            pressure: 0.9,
            timestampMs: 145,
          },
        ],
      }),
    ],
  });
}

export function createPhase1RuntimeSummary(): Phase1RuntimeSummary {
  const inventoryEntries = buildBrushInventoryFromExportManifest(
    referenceManifest as unknown as OpenBrushExportManifest,
    generatedBrushAssets.brushes as unknown as Record<string, BrushAssetRecord>,
  );
  const document = createPhase1FixtureDocument();
  const validationErrors = validateSketchDocument(document);
  const payload = writeSketchMemory(document.strokes);
  const parsedDocument = createSketchDocument({
    metadata: { source: "runtime" },
    layers: document.layers,
    strokes: readSketchMemory(payload.bytes, payload.brushGuids),
  });
  const parsedErrors = validateSketchDocument(parsedDocument);

  return {
    inventory: summarizeBrushInventory(inventoryEntries),
    fixture: summarizeSketchDocument(parsedDocument),
    fixtureMemoryBytes: payload.bytes.byteLength,
    fixtureParseStatus:
      validationErrors.length === 0 && parsedErrors.length === 0
        ? "round-trip-ok"
        : "invalid",
    fixtureValidationErrors: [...validationErrors, ...parsedErrors],
    activeBrushGuid: PHASE1_FIXTURE_BRUSH_GUID,
  };
}

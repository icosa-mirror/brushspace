import { describe, expect, it } from "vitest";

import {
  createSketchDocument,
  createSketchLayer,
  summarizeSketchDocument,
  validateSketchDocument,
} from "./document.js";
import { createPhase1FixtureDocument, createPhase1RuntimeSummary } from "./fixtures.js";
import { createEmptyStrokeData } from "./types.js";

describe("Open Brush sketch documents", () => {
  it("summarizes the hand-authored Phase 1 fixture", () => {
    const summary = summarizeSketchDocument(createPhase1FixtureDocument());

    expect(summary).toEqual({
      layerCount: 2,
      strokeCount: 1,
      controlPointCount: 3,
      brushGuidCount: 1,
    });
  });

  it("validates stroke layer references and empty strokes", () => {
    const document = createSketchDocument({
      layers: [createSketchLayer({ id: 0, name: "Layer 1" })],
      strokes: [
        createEmptyStrokeData({
          guid: "11111111-2222-3333-4444-555555555555",
          layerIndex: 9,
        }),
      ],
    });

    expect(validateSketchDocument(document)).toEqual([
      "Stroke 11111111-2222-3333-4444-555555555555 references missing layer 9.",
      "Stroke 11111111-2222-3333-4444-555555555555 has no control points.",
    ]);
  });

  it("creates a runtime summary from the real brush manifest and fixture memory", () => {
    const summary = createPhase1RuntimeSummary();

    expect(summary.inventory).toEqual({
      total: 123,
      supported: 4,
      fallback: 1,
      unsupported: 118,
    });
    expect(summary.fixture).toEqual({
      layerCount: 2,
      strokeCount: 1,
      controlPointCount: 3,
      brushGuidCount: 1,
    });
    expect(summary.fixtureMemoryBytes).toBeGreaterThan(0);
    expect(summary.fixtureParseStatus).toBe("round-trip-ok");
    expect(summary.fixtureValidationErrors).toEqual([]);
  });
});

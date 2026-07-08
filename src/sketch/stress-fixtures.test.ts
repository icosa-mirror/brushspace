import { describe, expect, it } from "vitest";

import { validateSketchDocument } from "./document.js";
import {
  createOpenBrushStressDocument,
  createOpenBrushStressLoadPlan,
} from "./stress-fixtures.js";
import { StrokeFlags } from "../types.js";

describe("open brush stress fixtures", () => {
  it("creates valid many-stroke documents with configurable counts", () => {
    const document = createOpenBrushStressDocument("many-strokes", {
      strokeCount: 12,
      layerCount: 3,
      controlPointsPerStroke: 4,
    });
    const plan = createOpenBrushStressLoadPlan("many-strokes", document, 5);

    expect(validateSketchDocument(document)).toEqual([]);
    expect(document.layers).toHaveLength(3);
    expect(document.strokes).toHaveLength(12);
    expect(plan.totalControlPoints).toBe(48);
    expect(plan.batchCount).toBe(3);
    expect(plan.progressive).toBe(true);
    expect(plan.counters.visibleStrokeCount).toBe(12);
  });

  it("marks transparent stress scenes with overdraw warnings", () => {
    const document = createOpenBrushStressDocument("transparent-strokes", {
      strokeCount: 120,
      layerCount: 2,
      controlPointsPerStroke: 3,
    });
    const plan = createOpenBrushStressLoadPlan(
      "transparent-strokes",
      document,
      200,
    );

    expect(validateSketchDocument(document)).toEqual([]);
    expect(plan.transparentStrokeCount).toBe(120);
    expect(plan.warnings).toContain("transparent-overdraw");
    expect(plan.counters.materialVariantCount).toBe(2);
  });

  it("pairs heavy symmetry strokes with group continuation flags", () => {
    const document = createOpenBrushStressDocument("heavy-symmetry", {
      strokeCount: 6,
      layerCount: 2,
      controlPointsPerStroke: 2,
    });

    expect(validateSketchDocument(document)).toEqual([]);
    expect(document.strokes).toHaveLength(6);
    for (let index = 0; index < document.strokes.length; index += 2) {
      const source = document.strokes[index];
      const mirrored = document.strokes[index + 1];
      expect(mirrored.groupId).toBe(source.groupId);
      expect(mirrored.flags).toBe(StrokeFlags.IsGroupContinue);
      expect(mirrored.controlPoints[0].position[0]).toBeGreaterThan(0);
      expect(source.controlPoints[0].position[0]).toBeLessThan(0);
    }
  });

  it("plans large imports as progressive loads with budget warnings", () => {
    const document = createOpenBrushStressDocument("large-import", {
      strokeCount: 640,
      layerCount: 8,
      controlPointsPerStroke: 8,
    });
    const plan = createOpenBrushStressLoadPlan("large-import", document, 64);

    expect(validateSketchDocument(document)).toEqual([]);
    expect(plan.totalStrokes).toBe(640);
    expect(plan.batchCount).toBe(10);
    expect(plan.progressive).toBe(true);
    expect(plan.warnings).toContain("progressive-load");
    expect(plan.warnings).toContain("draw-call-budget");
    expect(plan.counters.drawCallCount).toBe(640);
  });

  it("flags many layer scenes independently of stroke budget", () => {
    const document = createOpenBrushStressDocument("many-layers", {
      strokeCount: 8,
      layerCount: 24,
      controlPointsPerStroke: 2,
    });
    const plan = createOpenBrushStressLoadPlan("many-layers", document, 64);

    expect(validateSketchDocument(document)).toEqual([]);
    expect(plan.progressive).toBe(false);
    expect(plan.warnings).toContain("many-layers");
    expect(plan.totalLayers).toBe(24);
  });
});

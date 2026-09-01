import { describe, expect, it } from "vitest";

import {
  isStrokeBatchingEnabled,
  resolveStrokeBatchExtractionTransition,
  resolveStrokeRenderVisibility,
  resolveStrokeBatchVisibility,
} from "./stroke-batch-feature.js";

describe("stroke batching feature flag", () => {
  it.each(["", "?strokeBatches=0", "?strokeBatches=false"])(
    "keeps batching disabled for %s",
    (search) => {
      expect(isStrokeBatchingEnabled(search)).toBe(false);
    },
  );

  it.each(["?strokeBatches=1", "?strokeBatches=true"])(
    "enables batching for %s",
    (search) => {
      expect(isStrokeBatchingEnabled(search)).toBe(true);
    },
  );
});

describe("stroke batch visibility", () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
    [false, false, false],
  ] as const)(
    "resolves stroke=%s layer=%s as visible=%s",
    (stroke, layer, renderVisible) => {
      expect(resolveStrokeRenderVisibility(stroke, layer)).toBe(renderVisible);
    },
  );

  it.each([
    [true, false, false, true],
    [false, false, false, false],
    [true, true, true, false],
    [false, true, false, false],
  ] as const)(
    "routes renderVisible=%s extracted=%s to exactly one renderer",
    (renderVisible, extracted, privateMeshVisible, subsetVisible) => {
      expect(resolveStrokeBatchVisibility(renderVisible, extracted)).toEqual({
        privateMeshVisible,
        subsetVisible,
      });
    },
  );

  it.each([
    [true, true, false, "begin"],
    [true, true, true, "none"],
    [false, true, true, "finish"],
    [false, true, false, "none"],
    [true, false, false, "none"],
  ] as const)(
    "resolves selected=%s batched=%s extracted=%s as %s",
    (selected, batched, extracted, transition) => {
      expect(
        resolveStrokeBatchExtractionTransition(selected, batched, extracted),
      ).toBe(transition);
    },
  );
});

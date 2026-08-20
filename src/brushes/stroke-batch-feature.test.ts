import { describe, expect, it } from "vitest";

import {
  isStrokeBatchingEnabled,
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
});

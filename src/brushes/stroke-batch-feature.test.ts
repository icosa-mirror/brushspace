import { describe, expect, it } from "vitest";

import { isStrokeBatchingEnabled } from "./stroke-batch-feature.js";

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

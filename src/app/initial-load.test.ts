import { describe, expect, it } from "vitest";

import { InitialLoadTracker } from "./initial-load.js";

describe("InitialLoadTracker", () => {
  it("weights task progress into the overall fraction", () => {
    const tracker = new InitialLoadTracker([
      { id: "big", weight: 3 },
      { id: "small", weight: 1 },
    ]);
    expect(tracker.progress).toBe(0);
    tracker.setProgress("big", 0.5);
    expect(tracker.progress).toBeCloseTo((3 * 0.5) / 4);
    tracker.complete("small");
    expect(tracker.progress).toBeCloseTo((3 * 0.5 + 1) / 4);
    expect(tracker.done).toBe(false);
  });

  it("clamps progress to [0, 1] and never moves backwards", () => {
    const tracker = new InitialLoadTracker([{ id: "task", weight: 1 }]);
    tracker.setProgress("task", 0.8);
    tracker.setProgress("task", 0.3);
    expect(tracker.progress).toBeCloseTo(0.8);
    tracker.setProgress("task", 5);
    expect(tracker.progress).toBe(1);
  });

  it("ignores unknown task ids", () => {
    const tracker = new InitialLoadTracker([{ id: "task", weight: 1 }]);
    tracker.setProgress("nope", 1);
    expect(tracker.progress).toBe(0);
  });

  it("resolves whenDone once every task completes", async () => {
    const tracker = new InitialLoadTracker([
      { id: "a", weight: 1 },
      { id: "b", weight: 2 },
    ]);
    let resolved = false;
    void tracker.whenDone.then(() => {
      resolved = true;
    });
    tracker.complete("a");
    await Promise.resolve();
    expect(resolved).toBe(false);
    tracker.complete("b");
    await Promise.resolve();
    expect(resolved).toBe(true);
    expect(tracker.done).toBe(true);
    // Repeat completions stay settled without side effects.
    tracker.complete("b");
    expect(tracker.progress).toBe(1);
  });

  it("notifies subscribers immediately and supports unsubscribe", () => {
    const tracker = new InitialLoadTracker([{ id: "task", weight: 1 }]);
    const seen: number[] = [];
    const unsubscribe = tracker.subscribe((progress) => {
      seen.push(progress);
    });
    tracker.setProgress("task", 0.25);
    unsubscribe();
    tracker.setProgress("task", 0.75);
    expect(seen).toEqual([0, 0.25]);
  });
});

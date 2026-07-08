import { describe, expect, it, vi } from "vitest";

import { StrokeEntityHistory } from "./stroke-entity-history.js";

interface TestStrokeEntity {
  id: string;
  dispose(): void;
}

describe("StrokeEntityHistory", () => {
  it("preserves undone groups for redo without disposing them", () => {
    const history = new StrokeEntityHistory<TestStrokeEntity>();
    const stroke = createStrokeEntity("stroke-1");

    history.commit([stroke]);
    const undone = history.undo();

    expect(undone).toEqual([stroke]);
    expect(history.undoDepth).toBe(0);
    expect(history.redoDepth).toBe(1);
    expect(stroke.dispose).not.toHaveBeenCalled();

    const redone = history.redo();

    expect(redone).toEqual([stroke]);
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
    expect(stroke.dispose).not.toHaveBeenCalled();
  });

  it("disposes redo groups when a new commit invalidates redo history", () => {
    const history = new StrokeEntityHistory<TestStrokeEntity>();
    const firstStroke = createStrokeEntity("stroke-1");
    const secondStroke = createStrokeEntity("stroke-2");

    history.commit([firstStroke]);
    history.undo();
    history.commit([secondStroke]);

    expect(firstStroke.dispose).toHaveBeenCalledTimes(1);
    expect(secondStroke.dispose).not.toHaveBeenCalled();
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
  });

  it("tracks erased groups as reversible operations without disposing them", () => {
    const history = new StrokeEntityHistory<TestStrokeEntity>();
    const stroke = createStrokeEntity("erased-stroke");

    history.commitErased([stroke]);
    const undone = history.undoOperation();

    expect(undone?.kind).toBe("erase");
    expect(undone?.group).toEqual([stroke]);
    expect(history.undoDepth).toBe(0);
    expect(history.redoDepth).toBe(1);
    expect(stroke.dispose).not.toHaveBeenCalled();

    const redone = history.redoOperation();

    expect(redone?.kind).toBe("erase");
    expect(redone?.group).toEqual([stroke]);
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
    expect(stroke.dispose).not.toHaveBeenCalled();
  });

  it("does not dispose erased redo groups when a new commit invalidates redo history", () => {
    const history = new StrokeEntityHistory<TestStrokeEntity>();
    const erasedStroke = createStrokeEntity("erased-stroke");
    const newStroke = createStrokeEntity("new-stroke");

    history.commitErased([erasedStroke]);
    history.undo();
    history.commit([newStroke]);

    expect(erasedStroke.dispose).not.toHaveBeenCalled();
    expect(newStroke.dispose).not.toHaveBeenCalled();
    expect(history.undoDepth).toBe(1);
    expect(history.redoDepth).toBe(0);
  });

  it("clears all groups without double-disposing entities", () => {
    const history = new StrokeEntityHistory<TestStrokeEntity>();
    const undoStroke = createStrokeEntity("undo-stroke");
    const redoStroke = createStrokeEntity("redo-stroke");

    history.commit([undoStroke]);
    history.commit([redoStroke]);
    history.undo();

    expect(history.clearAll()).toBe(2);
    expect(undoStroke.dispose).toHaveBeenCalledTimes(1);
    expect(redoStroke.dispose).toHaveBeenCalledTimes(1);
    expect(history.clearAll()).toBe(0);
    expect(undoStroke.dispose).toHaveBeenCalledTimes(1);
    expect(redoStroke.dispose).toHaveBeenCalledTimes(1);
  });
});

function createStrokeEntity(id: string): TestStrokeEntity {
  return {
    id,
    dispose: vi.fn(),
  };
}

import { describe, expect, it } from "vitest";

import { UiCommandHistory } from "./ui-command-history.js";

describe("Open Brush UI command history", () => {
  it("tracks execute, undo, and redo depths", () => {
    const values: string[] = [];
    const history = new UiCommandHistory();

    history.execute({
      name: "select-layer",
      redo: () => values.push("redo"),
      undo: () => values.push("undo"),
    });

    expect(values).toEqual(["redo"]);
    expect(history.summarize()).toEqual({
      undoDepth: 1,
      redoDepth: 0,
      historyRevision: 1,
      lastCommandName: "select-layer",
    });

    expect(history.undo()).toBe(true);
    expect(values).toEqual(["redo", "undo"]);
    expect(history.summarize()).toEqual({
      undoDepth: 0,
      redoDepth: 1,
      historyRevision: 2,
      lastCommandName: "undo:select-layer",
    });

    expect(history.redo()).toBe(true);
    expect(values).toEqual(["redo", "undo", "redo"]);
    expect(history.summarize()).toEqual({
      undoDepth: 1,
      redoDepth: 0,
      historyRevision: 3,
      lastCommandName: "redo:select-layer",
    });
  });

  it("clears redo commands when a new command executes", () => {
    const values: string[] = [];
    const history = new UiCommandHistory();

    history.execute({
      name: "first",
      redo: () => values.push("first-redo"),
      undo: () => values.push("first-undo"),
    });
    history.undo();
    history.execute({
      name: "second",
      redo: () => values.push("second-redo"),
      undo: () => values.push("second-undo"),
    });

    expect(history.redo()).toBe(false);
    expect(history.summarize()).toMatchObject({
      undoDepth: 1,
      redoDepth: 0,
      lastCommandName: "second",
    });
  });
});

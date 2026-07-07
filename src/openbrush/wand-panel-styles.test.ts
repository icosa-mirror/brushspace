import { describe, expect, it } from "vitest";

import {
  resolvePhaseAWandButtonTone,
  resolvePhaseAWandButtonVisualState,
  type PhaseAWandButtonStateInput,
} from "./wand-panel-styles.js";

describe("Phase A wand panel button styles", () => {
  it("marks Draw active only when FreePaint is active without straightedge", () => {
    expect(
      resolvePhaseAWandButtonVisualState("tool-draw", baseState()),
    ).toBe("active");
    expect(
      resolvePhaseAWandButtonVisualState(
        "tool-draw",
        baseState({ straightEdgeEnabled: true }),
      ),
    ).toBe("inactive");
  });

  it("marks Line active as a straightedge mode over FreePaint", () => {
    const state = baseState({ straightEdgeEnabled: true });

    expect(resolvePhaseAWandButtonVisualState("tool-line", state)).toBe(
      "active",
    );
    expect(state.activeToolId).toBe("free-paint");
  });

  it("marks picker and eraser tools active from activeToolId", () => {
    expect(
      resolvePhaseAWandButtonVisualState(
        "tool-erase",
        baseState({ activeToolId: "eraser" }),
      ),
    ).toBe("active");
    expect(
      resolvePhaseAWandButtonVisualState(
        "tool-dropper",
        baseState({ activeToolId: "dropper" }),
      ),
    ).toBe("active");
  });

  it("disables history buttons when their stack is empty", () => {
    expect(
      resolvePhaseAWandButtonVisualState("stroke-history-undo", baseState()),
    ).toBe("disabled");
    expect(
      resolvePhaseAWandButtonVisualState(
        "stroke-history-undo",
        baseState({ undoDepth: 1 }),
      ),
    ).toBe("inactive");
    expect(
      resolvePhaseAWandButtonVisualState("stroke-history-redo", baseState()),
    ).toBe("disabled");
    expect(
      resolvePhaseAWandButtonVisualState(
        "stroke-history-redo",
        baseState({ redoDepth: 1 }),
      ),
    ).toBe("inactive");
  });

  it("keeps creation tools visually primary and utility actions secondary", () => {
    expect(resolvePhaseAWandButtonTone("tool-draw")).toBe("primary");
    expect(resolvePhaseAWandButtonTone("tool-line")).toBe("primary");
    expect(resolvePhaseAWandButtonTone("tool-erase")).toBe("primary");
    expect(resolvePhaseAWandButtonTone("tool-dropper")).toBe("secondary");
    expect(resolvePhaseAWandButtonTone("stroke-history-undo")).toBe(
      "secondary",
    );
  });
});

function baseState(
  overrides: Partial<PhaseAWandButtonStateInput> = {},
): PhaseAWandButtonStateInput {
  return {
    activeToolId: "free-paint",
    straightEdgeEnabled: false,
    undoDepth: 0,
    redoDepth: 0,
    ...overrides,
  };
}

import type { OpenBrushToolId } from "./tools.js";

export type PhaseAWandButtonId =
  | "tool-draw"
  | "tool-line"
  | "tool-erase"
  | "tool-color-picker"
  | "tool-brush-picker"
  | "tool-dropper"
  | "stroke-history-undo"
  | "stroke-history-redo";

export type PhaseAWandButtonVisualState = "active" | "inactive" | "disabled";
export type PhaseAWandButtonTone = "primary" | "secondary";

export interface PhaseAWandButtonStateInput {
  activeToolId: OpenBrushToolId;
  straightEdgeEnabled: boolean;
  undoDepth: number;
  redoDepth: number;
}

export const PHASE_A_WAND_BUTTON_IDS: readonly PhaseAWandButtonId[] = [
  "tool-draw",
  "tool-line",
  "tool-erase",
  "tool-color-picker",
  "tool-brush-picker",
  "tool-dropper",
  "stroke-history-undo",
  "stroke-history-redo",
] as const;

export function resolvePhaseAWandButtonVisualState(
  buttonId: PhaseAWandButtonId,
  state: PhaseAWandButtonStateInput,
): PhaseAWandButtonVisualState {
  switch (buttonId) {
    case "tool-draw":
      return state.activeToolId === "free-paint" && !state.straightEdgeEnabled
        ? "active"
        : "inactive";
    case "tool-line":
      return state.straightEdgeEnabled ? "active" : "inactive";
    case "tool-erase":
      return state.activeToolId === "eraser" ? "active" : "inactive";
    case "tool-color-picker":
      return state.activeToolId === "color-picker" ? "active" : "inactive";
    case "tool-brush-picker":
      return state.activeToolId === "brush-picker" ? "active" : "inactive";
    case "tool-dropper":
      return state.activeToolId === "dropper" ? "active" : "inactive";
    case "stroke-history-undo":
      return state.undoDepth > 0 ? "inactive" : "disabled";
    case "stroke-history-redo":
      return state.redoDepth > 0 ? "inactive" : "disabled";
  }
}

export function resolvePhaseAWandButtonTone(
  buttonId: PhaseAWandButtonId,
): PhaseAWandButtonTone {
  return buttonId === "tool-draw" ||
    buttonId === "tool-line" ||
    buttonId === "tool-erase"
    ? "primary"
    : "secondary";
}

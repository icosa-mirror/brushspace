export interface RuntimeStrokeSelectionState {
  layerIndex: number;
  commandIndex: number;
  visible: boolean;
  renderVisible: boolean;
  finalized: boolean;
  selected: boolean;
}

export interface StrokeSelectionSummary {
  selectedStrokeCount: number;
  activeSelectionLayerIndex: number;
  lastSelectedStrokeCommandIndex: number;
}

export function resolveLastSelectableStroke(
  strokes: RuntimeStrokeSelectionState[],
  activeLayerIndex: number,
): RuntimeStrokeSelectionState | undefined {
  let selectedStroke: RuntimeStrokeSelectionState | undefined;
  for (const stroke of strokes) {
    if (
      stroke.layerIndex !== activeLayerIndex ||
      !stroke.visible ||
      !stroke.renderVisible ||
      !stroke.finalized
    ) {
      continue;
    }
    if (!selectedStroke || stroke.commandIndex > selectedStroke.commandIndex) {
      selectedStroke = stroke;
    }
  }
  return selectedStroke;
}

export function summarizeStrokeSelection(
  strokes: RuntimeStrokeSelectionState[],
): StrokeSelectionSummary {
  let selectedStrokeCount = 0;
  let activeSelectionLayerIndex = -1;
  let lastSelectedStrokeCommandIndex = 0;
  let hasMixedLayerSelection = false;

  for (const stroke of strokes) {
    if (!stroke.selected) {
      continue;
    }
    selectedStrokeCount += 1;
    lastSelectedStrokeCommandIndex = Math.max(
      lastSelectedStrokeCommandIndex,
      stroke.commandIndex,
    );

    if (selectedStrokeCount === 1) {
      activeSelectionLayerIndex = stroke.layerIndex;
    } else if (activeSelectionLayerIndex !== stroke.layerIndex) {
      hasMixedLayerSelection = true;
      activeSelectionLayerIndex = -1;
    }
  }

  return {
    selectedStrokeCount,
    activeSelectionLayerIndex: hasMixedLayerSelection
      ? -1
      : activeSelectionLayerIndex,
    lastSelectedStrokeCommandIndex,
  };
}

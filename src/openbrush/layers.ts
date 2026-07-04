export interface RuntimeLayerState {
  layerIndex: number;
  layerName: string;
  visible: boolean;
  locked: boolean;
  selectionCanvas: boolean;
  active: boolean;
}

export interface RuntimeLayerSummary {
  paintLayerCount: number;
  selectionLayerCount: number;
  activeLayerIndex: number;
  activeLayerName: string;
  activeLayerVisible: boolean;
  activeLayerLocked: boolean;
}

export function getPaintLayers(
  layers: readonly RuntimeLayerState[],
): RuntimeLayerState[] {
  return layers
    .filter((layer) => !layer.selectionCanvas)
    .sort((a, b) => a.layerIndex - b.layerIndex);
}

export function getNextLayerIndex(
  layers: readonly RuntimeLayerState[],
): number {
  let maxIndex = -1;
  for (const layer of layers) {
    if (layer.layerIndex > maxIndex) {
      maxIndex = layer.layerIndex;
    }
  }
  return maxIndex + 1;
}

export function createNextLayerState(
  layers: readonly RuntimeLayerState[],
): RuntimeLayerState {
  const layerIndex = getNextLayerIndex(layers);
  const paintLayerCount = getPaintLayers(layers).length;
  return {
    layerIndex,
    layerName: `Layer ${paintLayerCount + 1}`,
    visible: true,
    locked: false,
    selectionCanvas: false,
    active: true,
  };
}

export function resolveActiveLayerIndex(
  layers: readonly RuntimeLayerState[],
  requestedLayerIndex: number,
): number {
  const paintLayers = getPaintLayers(layers);
  if (paintLayers.length === 0) {
    return requestedLayerIndex;
  }
  if (paintLayers.some((layer) => layer.layerIndex === requestedLayerIndex)) {
    return requestedLayerIndex;
  }
  return paintLayers[0].layerIndex;
}

export function cycleLayerIndex(
  layers: readonly RuntimeLayerState[],
  currentLayerIndex: number,
  offset: number,
): number {
  const paintLayers = getPaintLayers(layers);
  if (paintLayers.length === 0) {
    return currentLayerIndex;
  }

  const currentIndex = paintLayers.findIndex(
    (layer) => layer.layerIndex === currentLayerIndex,
  );
  const startIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex =
    (startIndex + offset + paintLayers.length) % paintLayers.length;
  return paintLayers[nextIndex].layerIndex;
}

export function summarizeRuntimeLayers(
  layers: readonly RuntimeLayerState[],
  activeLayerIndex: number,
): RuntimeLayerSummary {
  const paintLayers = getPaintLayers(layers);
  const selectionLayerCount = layers.length - paintLayers.length;
  const resolvedActiveLayerIndex = resolveActiveLayerIndex(
    layers,
    activeLayerIndex,
  );
  const activeLayer = paintLayers.find(
    (layer) => layer.layerIndex === resolvedActiveLayerIndex,
  );

  return {
    paintLayerCount: paintLayers.length,
    selectionLayerCount,
    activeLayerIndex: resolvedActiveLayerIndex,
    activeLayerName: activeLayer?.layerName ?? "No layer",
    activeLayerVisible: activeLayer?.visible ?? false,
    activeLayerLocked: activeLayer?.locked ?? false,
  };
}


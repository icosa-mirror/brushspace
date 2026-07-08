export interface RuntimeLayerState {
  layerIndex: number;
  order: number;
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
  activeLayerOrder: number;
  activeLayerName: string;
  activeLayerVisible: boolean;
  activeLayerLocked: boolean;
}

export function getPaintLayers(
  layers: readonly RuntimeLayerState[],
): RuntimeLayerState[] {
  return layers
    .filter((layer) => !layer.selectionCanvas)
    .sort((a, b) => a.order - b.order || a.layerIndex - b.layerIndex);
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

export function getNextLayerOrder(
  layers: readonly RuntimeLayerState[],
): number {
  let maxOrder = -1;
  for (const layer of layers) {
    if (!layer.selectionCanvas && layer.order > maxOrder) {
      maxOrder = layer.order;
    }
  }
  return maxOrder + 1;
}

export function createNextLayerState(
  layers: readonly RuntimeLayerState[],
): RuntimeLayerState {
  const layerIndex = getNextLayerIndex(layers);
  const paintLayerCount = getPaintLayers(layers).length;
  return {
    layerIndex,
    order: getNextLayerOrder(layers),
    layerName: `Layer ${paintLayerCount + 1}`,
    visible: true,
    locked: false,
    selectionCanvas: false,
    active: true,
  };
}

export function reorderLayerStates(
  layers: readonly RuntimeLayerState[],
  layerIndex: number,
  offset: number,
): RuntimeLayerState[] {
  const paintLayers = getPaintLayers(layers);
  const currentIndex = paintLayers.findIndex(
    (layer) => layer.layerIndex === layerIndex,
  );
  const targetIndex = currentIndex + offset;
  if (
    currentIndex === -1 ||
    targetIndex < 0 ||
    targetIndex >= paintLayers.length
  ) {
    return layers.map((layer) => ({ ...layer }));
  }

  const reorderedPaintLayers = paintLayers.slice();
  const [movedLayer] = reorderedPaintLayers.splice(currentIndex, 1);
  reorderedPaintLayers.splice(targetIndex, 0, movedLayer);

  const orderByLayerIndex = new Map<number, number>();
  reorderedPaintLayers.forEach((layer, order) => {
    orderByLayerIndex.set(layer.layerIndex, order);
  });

  return layers.map((layer) => ({
    ...layer,
    order: layer.selectionCanvas
      ? layer.order
      : (orderByLayerIndex.get(layer.layerIndex) ?? layer.order),
  }));
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
    activeLayerOrder: activeLayer?.order ?? 0,
    activeLayerName: activeLayer?.layerName ?? "No layer",
    activeLayerVisible: activeLayer?.visible ?? false,
    activeLayerLocked: activeLayer?.locked ?? false,
  };
}

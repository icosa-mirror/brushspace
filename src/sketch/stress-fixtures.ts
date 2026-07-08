import {
  createSketchDocument,
  createSketchLayer,
  type SketchDocument,
} from "./document.js";
import {
  estimateOpenBrushPerformanceCounters,
  type OpenBrushPerformanceCounters,
} from "../app/performance-counters.js";
import {
  StrokeFlags,
  createEmptyStrokeData,
  type ControlPoint,
  type Rgba,
  type StrokeData,
} from "../types.js";

export type OpenBrushStressScenarioId =
  | "many-strokes"
  | "transparent-strokes"
  | "many-layers"
  | "heavy-symmetry"
  | "large-import"
  | "undo-redo-cycle";

export interface OpenBrushStressDocumentOptions {
  strokeCount?: number;
  layerCount?: number;
  controlPointsPerStroke?: number;
}

export interface OpenBrushStressLoadPlan {
  scenarioId: OpenBrushStressScenarioId;
  totalStrokes: number;
  totalLayers: number;
  totalControlPoints: number;
  batchSize: number;
  batchCount: number;
  progressive: boolean;
  transparentStrokeCount: number;
  warnings: string[];
  counters: OpenBrushPerformanceCounters;
}

const STRESS_BRUSH_GUID = "429ed64a-4e97-4466-84d3-145a861ef684";
const DEFAULT_BATCH_SIZE = 64;
const DEFAULT_STRESS_OPTIONS: Record<
  OpenBrushStressScenarioId,
  Required<OpenBrushStressDocumentOptions>
> = {
  "many-strokes": {
    strokeCount: 640,
    layerCount: 4,
    controlPointsPerStroke: 4,
  },
  "transparent-strokes": {
    strokeCount: 240,
    layerCount: 3,
    controlPointsPerStroke: 5,
  },
  "many-layers": {
    strokeCount: 180,
    layerCount: 24,
    controlPointsPerStroke: 4,
  },
  "heavy-symmetry": {
    strokeCount: 320,
    layerCount: 4,
    controlPointsPerStroke: 4,
  },
  "large-import": {
    strokeCount: 900,
    layerCount: 8,
    controlPointsPerStroke: 12,
  },
  "undo-redo-cycle": {
    strokeCount: 96,
    layerCount: 2,
    controlPointsPerStroke: 3,
  },
};

export function createOpenBrushStressDocument(
  scenarioId: OpenBrushStressScenarioId,
  options: OpenBrushStressDocumentOptions = {},
): SketchDocument {
  const resolved = resolveOptions(scenarioId, options);
  const layers = Array.from({ length: resolved.layerCount }, (_, index) =>
    createSketchLayer({ id: index, name: `Stress ${index + 1}` }),
  );
  const strokes =
    scenarioId === "heavy-symmetry"
      ? createSymmetryStrokes(resolved)
      : createStressStrokes(scenarioId, resolved);

  return createSketchDocument({
    metadata: { source: "fixture" },
    layers,
    strokes,
  });
}

export function createOpenBrushStressLoadPlan(
  scenarioId: OpenBrushStressScenarioId,
  document: SketchDocument,
  batchSize = DEFAULT_BATCH_SIZE,
): OpenBrushStressLoadPlan {
  const totalControlPoints = document.strokes.reduce(
    (sum, stroke) => sum + stroke.controlPoints.length,
    0,
  );
  const transparentStrokeCount = document.strokes.filter(
    (stroke) => stroke.color[3] < 1,
  ).length;
  const counters = estimateOpenBrushPerformanceCounters({
    layerCount: document.layers.length,
    visibleStrokeCount: document.strokes.length,
    finalizedStrokeCount: document.strokes.length,
    vertexCount: estimateVertexCount(document.strokes),
    indexCount: estimateIndexCount(document.strokes),
    materialVariantCount: transparentStrokeCount > 0 ? 2 : 1,
  });
  const normalizedBatchSize = Math.max(1, Math.floor(batchSize));
  const batchCount = Math.ceil(document.strokes.length / normalizedBatchSize);
  const warnings = createStressWarnings({
    counters,
    document,
    progressive: batchCount > 1,
    transparentStrokeCount,
  });

  return {
    scenarioId,
    totalStrokes: document.strokes.length,
    totalLayers: document.layers.length,
    totalControlPoints,
    batchSize: normalizedBatchSize,
    batchCount,
    progressive: batchCount > 1,
    transparentStrokeCount,
    warnings,
    counters,
  };
}

function resolveOptions(
  scenarioId: OpenBrushStressScenarioId,
  options: OpenBrushStressDocumentOptions,
): Required<OpenBrushStressDocumentOptions> {
  const defaults = DEFAULT_STRESS_OPTIONS[scenarioId];
  return {
    strokeCount: Math.max(0, Math.floor(options.strokeCount ?? defaults.strokeCount)),
    layerCount: Math.max(1, Math.floor(options.layerCount ?? defaults.layerCount)),
    controlPointsPerStroke: Math.max(
      1,
      Math.floor(
        options.controlPointsPerStroke ?? defaults.controlPointsPerStroke,
      ),
    ),
  };
}

function createStressStrokes(
  scenarioId: OpenBrushStressScenarioId,
  options: Required<OpenBrushStressDocumentOptions>,
): StrokeData[] {
  return Array.from({ length: options.strokeCount }, (_, index) =>
    createStressStroke({
      index,
      groupId: index + 1,
      layerIndex: index % options.layerCount,
      controlPointCount: options.controlPointsPerStroke,
      color: createStrokeColor(scenarioId, index),
      mirrored: false,
    }),
  );
}

function createSymmetryStrokes(
  options: Required<OpenBrushStressDocumentOptions>,
): StrokeData[] {
  const pairCount = Math.ceil(options.strokeCount / 2);
  const strokes: StrokeData[] = [];
  for (let index = 0; index < pairCount; index += 1) {
    const layerIndex = index % options.layerCount;
    const groupId = index + 1;
    const color = createStrokeColor("heavy-symmetry", index);
    strokes.push(
      createStressStroke({
        index: index * 2,
        groupId,
        layerIndex,
        controlPointCount: options.controlPointsPerStroke,
        color,
        mirrored: false,
      }),
    );
    if (strokes.length < options.strokeCount) {
      strokes.push(
        createStressStroke({
          index: index * 2 + 1,
          groupId,
          layerIndex,
          controlPointCount: options.controlPointsPerStroke,
          color,
          mirrored: true,
        }),
      );
    }
  }
  return strokes;
}

function createStressStroke({
  index,
  groupId,
  layerIndex,
  controlPointCount,
  color,
  mirrored,
}: {
  index: number;
  groupId: number;
  layerIndex: number;
  controlPointCount: number;
  color: Rgba;
  mirrored: boolean;
}): StrokeData {
  return createEmptyStrokeData({
    brushGuid: STRESS_BRUSH_GUID,
    brushSize: 0.22 + (index % 5) * 0.03,
    brushScale: 1,
    color,
    flags: mirrored ? StrokeFlags.IsGroupContinue : StrokeFlags.None,
    seed: index + 1,
    groupId,
    layerIndex,
    guid: `stress-stroke-${String(index + 1).padStart(5, "0")}`,
    controlPoints: createControlPoints(index, controlPointCount, mirrored),
  });
}

function createControlPoints(
  strokeIndex: number,
  count: number,
  mirrored: boolean,
): ControlPoint[] {
  const row = Math.floor(strokeIndex / 32);
  const column = strokeIndex % 32;
  const sign = mirrored ? -1 : 1;
  const startX = sign * (-0.8 + column * 0.05);
  const startY = 0.85 + (row % 18) * 0.035;
  const startZ = -1.4 - Math.floor(row / 18) * 0.08;

  return Array.from({ length: count }, (_, index) => ({
    position: [
      startX + sign * index * 0.025,
      startY + Math.sin((strokeIndex + index) * 0.4) * 0.015,
      startZ - index * 0.012,
    ],
    orientation: [0, 0, 0, 1],
    pressure: 0.35 + ((strokeIndex + index) % 5) * 0.12,
    timestampMs: strokeIndex * 16 + index * 12,
  }));
}

function createStrokeColor(
  scenarioId: OpenBrushStressScenarioId,
  index: number,
): Rgba {
  const hueBucket = index % 6;
  const base: Rgba =
    hueBucket === 0
      ? [0.1, 0.45, 0.95, 1]
      : hueBucket === 1
        ? [0.95, 0.3, 0.18, 1]
        : hueBucket === 2
          ? [0.2, 0.75, 0.45, 1]
          : hueBucket === 3
            ? [0.95, 0.8, 0.2, 1]
            : hueBucket === 4
              ? [0.55, 0.35, 0.95, 1]
              : [0.95, 0.55, 0.2, 1];
  if (scenarioId === "transparent-strokes" || index % 11 === 0) {
    return [base[0], base[1], base[2], scenarioId === "large-import" ? 0.65 : 0.42];
  }
  return base;
}

function createStressWarnings({
  counters,
  document,
  progressive,
  transparentStrokeCount,
}: {
  counters: OpenBrushPerformanceCounters;
  document: SketchDocument;
  progressive: boolean;
  transparentStrokeCount: number;
}): string[] {
  const warnings: string[] = [];
  if (counters.warning) {
    warnings.push(counters.warning);
  }
  if (progressive) {
    warnings.push("progressive-load");
  }
  if (transparentStrokeCount >= 100) {
    warnings.push("transparent-overdraw");
  }
  if (document.layers.length >= 16) {
    warnings.push("many-layers");
  }
  return warnings;
}

function estimateVertexCount(strokes: StrokeData[]): number {
  return strokes.reduce(
    (sum, stroke) => sum + Math.max(1, stroke.controlPoints.length) * 2,
    0,
  );
}

function estimateIndexCount(strokes: StrokeData[]): number {
  return strokes.reduce(
    (sum, stroke) => sum + Math.max(0, stroke.controlPoints.length - 1) * 6,
    0,
  );
}

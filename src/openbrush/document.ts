import type { StrokeData } from "./types.js";

export interface SketchLayer {
  id: number;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface SketchMetadata {
  appName: string;
  schemaVersion: number;
  source: "fixture" | "tilt" | "runtime";
}

export interface SketchDocument {
  metadata: SketchMetadata;
  layers: SketchLayer[];
  strokes: StrokeData[];
}

export interface SketchDocumentSummary {
  layerCount: number;
  strokeCount: number;
  controlPointCount: number;
  brushGuidCount: number;
}

export function createSketchDocument({
  metadata,
  layers,
  strokes,
}: {
  metadata?: Partial<SketchMetadata>;
  layers?: SketchLayer[];
  strokes?: StrokeData[];
} = {}): SketchDocument {
  return {
    metadata: {
      appName: "Open Brush IWSDK Port",
      schemaVersion: 1,
      source: "fixture",
      ...metadata,
    },
    layers: layers ?? [createSketchLayer({ id: 0, name: "Layer 1" })],
    strokes: strokes ?? [],
  };
}

export function createSketchLayer({
  id,
  name,
  visible = true,
  locked = false,
}: {
  id: number;
  name: string;
  visible?: boolean;
  locked?: boolean;
}): SketchLayer {
  return { id, name, visible, locked };
}

export function summarizeSketchDocument(
  document: SketchDocument,
): SketchDocumentSummary {
  const brushGuids = new Set<string>();
  let controlPointCount = 0;

  for (const stroke of document.strokes) {
    brushGuids.add(stroke.brushGuid);
    controlPointCount += stroke.controlPoints.length;
  }

  return {
    layerCount: document.layers.length,
    strokeCount: document.strokes.length,
    controlPointCount,
    brushGuidCount: brushGuids.size,
  };
}

export function validateSketchDocument(document: SketchDocument): string[] {
  const errors: string[] = [];
  if (document.layers.length === 0) {
    errors.push("Sketch document must contain at least one layer.");
  }

  const layerIds = new Set(document.layers.map((layer) => layer.id));
  for (const stroke of document.strokes) {
    if (!layerIds.has(stroke.layerIndex)) {
      errors.push(`Stroke ${stroke.guid} references missing layer ${stroke.layerIndex}.`);
    }
    if (stroke.controlPoints.length === 0) {
      errors.push(`Stroke ${stroke.guid} has no control points.`);
    }
  }

  return errors;
}

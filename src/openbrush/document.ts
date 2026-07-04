import type { Quat, StrokeData, Vec3 } from "./types.js";

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

export type SketchMediaKind = "image" | "model";

export interface SketchMediaTransform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface SketchMediaReference {
  id: string;
  kind: SketchMediaKind;
  mediaPath: string;
  originalName: string;
  mimeType: string;
  byteLength: number;
  transform: SketchMediaTransform;
}

export interface SketchDocument {
  metadata: SketchMetadata;
  layers: SketchLayer[];
  strokes: StrokeData[];
  media: SketchMediaReference[];
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
  media,
  strokes,
}: {
  metadata?: Partial<SketchMetadata>;
  layers?: SketchLayer[];
  media?: SketchMediaReference[];
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
    media: media?.map(cloneSketchMediaReference) ?? [],
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

  for (const media of document.media) {
    if (!media.id) {
      errors.push("Media reference is missing an id.");
    }
    if (!media.mediaPath) {
      errors.push(`Media ${media.id || "(unknown)"} is missing a media path.`);
    }
  }

  return errors;
}

function cloneSketchMediaReference(
  media: SketchMediaReference,
): SketchMediaReference {
  return {
    ...media,
    transform: {
      position: [...media.transform.position] as Vec3,
      rotation: [...media.transform.rotation] as Quat,
      scale: [...media.transform.scale] as Vec3,
    },
  };
}

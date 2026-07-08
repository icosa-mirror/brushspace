import {
  OpenBrushBinaryReader,
  OpenBrushBinaryWriter,
  SKETCH_SENTINEL,
  SKETCH_VERSION,
  normalizeGuid,
} from "./binary.js";
import {
  CONTROL_POINT_EXTENSION_MASK,
  ControlPointExtension,
  StrokeExtension,
  StrokeFlags,
  createEmptyStrokeData,
  type ControlPoint,
  type StrokeData,
} from "../types.js";

export const ZERO_GUID = "00000000-0000-0000-0000-000000000000";

export interface SketchMemoryPayload {
  bytes: Uint8Array;
  brushGuids: string[];
}

export function writeSketchMemory(
  strokes: readonly StrokeData[],
): SketchMemoryPayload {
  const writer = new OpenBrushBinaryWriter();
  const brushGuids: string[] = [];
  const brushIndexes = new Map<string, number>();

  writer.writeUint32(SKETCH_SENTINEL);
  writer.writeInt32(SKETCH_VERSION);
  writer.writeInt32(0);
  writer.writeUint32(0);
  writer.writeInt32(strokes.length);

  for (const stroke of strokes) {
    const brushGuid = normalizeGuid(stroke.brushGuid);
    let brushIndex = brushIndexes.get(brushGuid);
    if (brushIndex === undefined) {
      brushIndex = brushGuids.length;
      brushGuids.push(brushGuid);
      brushIndexes.set(brushGuid, brushIndex);
    }

    writer.writeInt32(brushIndex);
    writer.writeColor(stroke.color);
    writer.writeFloat32(stroke.brushSize);

    let strokeExtensionMask = StrokeExtension.Flags | StrokeExtension.Seed | StrokeExtension.Layer;
    if (stroke.brushScale !== 1) {
      strokeExtensionMask |= StrokeExtension.Scale;
    }
    if (stroke.groupId !== 0) {
      strokeExtensionMask |= StrokeExtension.Group;
    }

    writer.writeUint32(strokeExtensionMask);
    writer.writeUint32(CONTROL_POINT_EXTENSION_MASK);
    writer.writeUint32(stroke.flags);
    if ((strokeExtensionMask & StrokeExtension.Scale) !== 0) {
      writer.writeFloat32(stroke.brushScale);
    }
    if ((strokeExtensionMask & StrokeExtension.Group) !== 0) {
      writer.writeUint32(stroke.groupId);
    }
    writer.writeInt32(stroke.seed);
    writer.writeUint32(stroke.layerIndex);

    writer.writeInt32(stroke.controlPoints.length);
    for (const controlPoint of stroke.controlPoints) {
      writer.writeControlPoint(controlPoint);
    }
  }

  return { bytes: writer.toUint8Array(), brushGuids };
}

export function readSketchMemory(
  bytes: Uint8Array,
  brushGuids: readonly string[],
): StrokeData[] {
  const reader = new OpenBrushBinaryReader(bytes);
  const sentinel = reader.readUint32();
  if (sentinel !== SKETCH_SENTINEL) {
    throw new Error("Invalid Open Brush sketch memory: bad sentinel");
  }

  const version = reader.readInt32();
  if (version < 5 || version > 6) {
    throw new Error(`Unsupported Open Brush sketch memory version: ${version}`);
  }

  reader.readInt32();
  reader.skip(reader.readUint32());

  const count = reader.readInt32();
  if (count < 0) {
    throw new Error(`Invalid Open Brush sketch memory stroke count: ${count}`);
  }

  const strokes: StrokeData[] = [];
  for (let index = 0; index < count; index += 1) {
    const brushIndex = reader.readInt32();
    const brushGuid = brushGuids[brushIndex] ?? ZERO_GUID;
    const color = reader.readColor();
    const brushSize = reader.readFloat32();
    const strokeExtensionMask = reader.readUint32();
    const controlPointExtensionMask = reader.readUint32();

    const stroke = createEmptyStrokeData({
      color,
      brushGuid,
      brushSize,
      guid: ZERO_GUID,
    });

    forEachSetBit(strokeExtensionMask, (bit) => {
      switch (bit) {
        case StrokeExtension.Flags:
          stroke.flags = reader.readUint32() as StrokeFlags;
          break;
        case StrokeExtension.Scale:
          stroke.brushScale = reader.readFloat32();
          break;
        case StrokeExtension.Group:
          stroke.groupId = reader.readUint32();
          break;
        case StrokeExtension.Seed:
          stroke.seed = reader.readInt32();
          break;
        case StrokeExtension.Layer:
          stroke.layerIndex = reader.readUint32();
          break;
        default:
          skipUnknownStrokeExtension(reader, bit);
          break;
      }
    });

    const controlPointCount = reader.readInt32();
    if (controlPointCount < 0) {
      throw new Error(
        `Invalid Open Brush sketch memory control point count: ${controlPointCount}`,
      );
    }

    stroke.controlPoints = readControlPoints(
      reader,
      controlPointCount,
      controlPointExtensionMask,
    );
    strokes.push(stroke);
  }

  return strokes;
}

function readControlPoints(
  reader: OpenBrushBinaryReader,
  count: number,
  extensionMask: number,
): ControlPoint[] {
  const controlPoints: ControlPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const controlPoint: ControlPoint = {
      position: reader.readVec3(),
      orientation: reader.readQuaternion(),
      pressure: 1,
      timestampMs: 0,
    };

    forEachSetBit(extensionMask, (bit) => {
      switch (bit) {
        case ControlPointExtension.Pressure:
          controlPoint.pressure = reader.readFloat32();
          break;
        case ControlPointExtension.Timestamp:
          controlPoint.timestampMs = reader.readUint32();
          break;
        default:
          reader.readInt32();
          break;
      }
    });

    controlPoints.push(controlPoint);
  }

  return controlPoints;
}

function skipUnknownStrokeExtension(
  reader: OpenBrushBinaryReader,
  bit: number,
): void {
  if ((bit & StrokeExtension.MaskSingleWord) !== 0) {
    reader.readUint32();
    return;
  }

  reader.skip(reader.readUint32());
}

function forEachSetBit(mask: number, visit: (bit: number) => void): void {
  for (let fields = mask >>> 0; fields !== 0; fields &= fields - 1) {
    visit(fields & ~(fields - 1));
  }
}

import { describe, expect, it } from "vitest";

import { OpenBrushBinaryWriter, SKETCH_SENTINEL, SKETCH_VERSION } from "./binary.js";
import {
  ControlPointExtension,
  StrokeExtension,
  StrokeFlags,
  createEmptyStrokeData,
} from "../types.js";
import {
  ZERO_GUID,
  readSketchMemory,
  writeSketchMemory,
} from "./sketch-memory.js";

describe("Open Brush sketch memory", () => {
  it("round-trips strokes and returns the brush GUID table", () => {
    const stroke = createEmptyStrokeData({
      color: [0.1, 0.2, 0.3, 1],
      brushGuid: "429ed64a-4e97-4466-84d3-145a861ef684",
      brushSize: 0.42,
      brushScale: 2,
      flags: StrokeFlags.IsGroupContinue,
      seed: -99,
      groupId: 7,
      layerIndex: 3,
      controlPoints: [
        {
          position: [1, 2, 3],
          orientation: [0, 0, 0, 1],
          pressure: 0.5,
          timestampMs: 100,
        },
        {
          position: [4, 5, 6],
          orientation: [0, 0.25, 0.5, 1],
          pressure: 0.75,
          timestampMs: 150,
        },
      ],
    });

    const payload = writeSketchMemory([stroke]);
    expect(payload.brushGuids).toEqual(["429ed64a-4e97-4466-84d3-145a861ef684"]);

    const [roundTrip] = readSketchMemory(payload.bytes, payload.brushGuids);
    expect(roundTrip.brushGuid).toBe(stroke.brushGuid);
    expect(roundTrip.brushSize).toBeCloseTo(stroke.brushSize);
    expect(roundTrip.brushScale).toBe(stroke.brushScale);
    expect(roundTrip.flags).toBe(stroke.flags);
    expect(roundTrip.seed).toBe(stroke.seed);
    expect(roundTrip.groupId).toBe(stroke.groupId);
    expect(roundTrip.layerIndex).toBe(stroke.layerIndex);
    expect(roundTrip.controlPoints).toEqual(stroke.controlPoints);
  });

  it("uses the zero GUID for out-of-range brush indices", () => {
    const writer = createSketchWriterWithOneStroke({
      brushIndex: 5,
      strokeExtensionMask: StrokeExtension.Flags | StrokeExtension.Seed | StrokeExtension.Layer,
      controlPointExtensionMask:
        ControlPointExtension.Pressure | ControlPointExtension.Timestamp,
    });
    writer.writeUint32(StrokeFlags.None);
    writer.writeInt32(1);
    writer.writeUint32(0);
    writer.writeInt32(0);

    const [stroke] = readSketchMemory(writer.toUint8Array(), []);
    expect(stroke.brushGuid).toBe(ZERO_GUID);
  });

  it("skips unknown stroke extensions and preserves following fields", () => {
    const unknownWord = 1 << 5;
    const unknownBlob = 1 << 16;
    const writer = createSketchWriterWithOneStroke({
      strokeExtensionMask:
        StrokeExtension.Flags |
        StrokeExtension.Seed |
        StrokeExtension.Layer |
        unknownWord |
        unknownBlob,
      controlPointExtensionMask:
        ControlPointExtension.Pressure | ControlPointExtension.Timestamp,
    });
    writer.writeUint32(StrokeFlags.IsGroupContinue);
    writer.writeInt32(123);
    writer.writeUint32(4);
    writer.writeUint32(0xabcdef01);
    writer.writeUint32(3);
    writer.writeBytes(new Uint8Array([9, 8, 7]));
    writer.writeInt32(0);

    const [stroke] = readSketchMemory(writer.toUint8Array(), [
      "429ed64a-4e97-4466-84d3-145a861ef684",
    ]);

    expect(stroke.flags).toBe(StrokeFlags.IsGroupContinue);
    expect(stroke.seed).toBe(123);
    expect(stroke.layerIndex).toBe(4);
    expect(stroke.controlPoints).toEqual([]);
  });

  it("skips unknown control point extensions", () => {
    const writer = createSketchWriterWithOneStroke({
      strokeExtensionMask: StrokeExtension.Flags | StrokeExtension.Seed | StrokeExtension.Layer,
      controlPointExtensionMask:
        ControlPointExtension.Pressure | ControlPointExtension.Timestamp | (1 << 2),
    });
    writer.writeUint32(StrokeFlags.None);
    writer.writeInt32(11);
    writer.writeUint32(2);
    writer.writeInt32(1);
    writer.writeVec3([1, 2, 3]);
    writer.writeQuaternion([0, 0, 0, 1]);
    writer.writeFloat32(0.25);
    writer.writeUint32(77);
    writer.writeInt32(0x12345678);

    const [stroke] = readSketchMemory(writer.toUint8Array(), [
      "429ed64a-4e97-4466-84d3-145a861ef684",
    ]);

    expect(stroke.controlPoints).toEqual([
      {
        position: [1, 2, 3],
        orientation: [0, 0, 0, 1],
        pressure: 0.25,
        timestampMs: 77,
      },
    ]);
  });
});

function createSketchWriterWithOneStroke({
  brushIndex,
  strokeExtensionMask,
  controlPointExtensionMask,
}: {
  brushIndex?: number;
  strokeExtensionMask: number;
  controlPointExtensionMask: number;
}): OpenBrushBinaryWriter {
  const writer = new OpenBrushBinaryWriter();
  writer.writeUint32(SKETCH_SENTINEL);
  writer.writeInt32(SKETCH_VERSION);
  writer.writeInt32(0);
  writer.writeUint32(0);
  writer.writeInt32(1);
  writer.writeInt32(brushIndex ?? 0);
  writer.writeColor([1, 1, 1, 1]);
  writer.writeFloat32(1);
  writer.writeUint32(strokeExtensionMask);
  writer.writeUint32(controlPointExtensionMask);
  return writer;
}

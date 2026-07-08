import { describe, expect, it } from "vitest";

import {
  dotNetBytesToGuidString,
  guidStringToDotNetBytes,
  normalizeGuid,
  OpenBrushBinaryReader,
  OpenBrushBinaryWriter,
  SKETCH_SENTINEL,
  SKETCH_VERSION,
} from "./binary.js";
import {
  CONTROL_POINT_BINARY_SIZE_BYTES,
  CONTROL_POINT_EXTENSION_MASK,
  ControlPointExtension,
  StrokeExtension,
  StrokeFlags,
  createEmptyStrokeData,
  type ControlPoint,
} from "../types.js";

describe("Open Brush binary primitives", () => {
  it("writes little-endian uint, int, and float values", () => {
    const writer = new OpenBrushBinaryWriter();
    writer.writeUint32(0xc576a5cd);
    writer.writeInt32(-2);
    writer.writeFloat32(1.5);

    expect([...writer.toUint8Array()]).toEqual([
      0xcd, 0xa5, 0x76, 0xc5, 0xfe, 0xff, 0xff, 0xff, 0x00, 0x00, 0xc0, 0x3f,
    ]);
  });

  it("round-trips sketch header primitives", () => {
    const writer = new OpenBrushBinaryWriter();
    writer.writeUint32(SKETCH_SENTINEL);
    writer.writeInt32(SKETCH_VERSION);
    writer.writeInt32(0);
    writer.writeUint32(0);

    const reader = new OpenBrushBinaryReader(writer.toUint8Array());
    expect(reader.readUint32()).toBe(SKETCH_SENTINEL);
    expect(reader.readInt32()).toBe(SKETCH_VERSION);
    expect(reader.readInt32()).toBe(0);
    expect(reader.readUint32()).toBe(0);
    expect(reader.remaining).toBe(0);
  });

  it("matches .NET Guid.ToByteArray ordering", () => {
    const guid = "00112233-4455-6677-8899-aabbccddeeff";
    const bytes = guidStringToDotNetBytes(guid);

    expect([...bytes]).toEqual([
      0x33, 0x22, 0x11, 0x00, 0x55, 0x44, 0x77, 0x66, 0x88, 0x99, 0xaa, 0xbb,
      0xcc, 0xdd, 0xee, 0xff,
    ]);
    expect(dotNetBytesToGuidString(bytes)).toBe(guid);
    expect(normalizeGuid("00112233-4455-6677-8899-AABBCCDDEEFF")).toBe(guid);
  });

  it("writes and reads the Open Brush control point fast-path layout", () => {
    const controlPoint: ControlPoint = {
      position: [1, -2, 3.5],
      orientation: [0, 0.25, 0.5, 1],
      pressure: 0.75,
      timestampMs: 1234,
    };

    const writer = new OpenBrushBinaryWriter();
    writer.writeControlPoint(controlPoint);
    const bytes = writer.toUint8Array();

    expect(bytes.byteLength).toBe(CONTROL_POINT_BINARY_SIZE_BYTES);

    const reader = new OpenBrushBinaryReader(bytes);
    expect(reader.readControlPoint()).toEqual(controlPoint);
    expect(reader.remaining).toBe(0);
  });

  it("defines extension masks used by data.sketch strokes", () => {
    expect(CONTROL_POINT_EXTENSION_MASK).toBe(
      ControlPointExtension.Pressure | ControlPointExtension.Timestamp,
    );
    expect(StrokeExtension.Flags).toBe(1);
    expect(StrokeExtension.Scale).toBe(2);
    expect(StrokeExtension.Group).toBe(4);
    expect(StrokeExtension.Seed).toBe(8);
    expect(StrokeExtension.Layer).toBe(16);
    expect(StrokeFlags.IsGroupContinue).toBe(2);
  });

  it("creates a stroke model without dropping Open Brush metadata fields", () => {
    const stroke = createEmptyStrokeData({
      brushGuid: "00112233-4455-6677-8899-aabbccddeeff",
      brushSize: 0.42,
      brushScale: 2,
      flags: StrokeFlags.IsGroupContinue,
      seed: -123,
      groupId: 9,
      layerIndex: 3,
      controlPoints: [
        {
          position: [0, 1, 2],
          orientation: [0, 0, 0, 1],
          pressure: 1,
          timestampMs: 10,
        },
      ],
    });

    expect(stroke.brushGuid).toBe("00112233-4455-6677-8899-aabbccddeeff");
    expect(stroke.brushSize).toBe(0.42);
    expect(stroke.brushScale).toBe(2);
    expect(stroke.flags).toBe(StrokeFlags.IsGroupContinue);
    expect(stroke.seed).toBe(-123);
    expect(stroke.groupId).toBe(9);
    expect(stroke.layerIndex).toBe(3);
    expect(stroke.controlPoints).toHaveLength(1);
  });
});

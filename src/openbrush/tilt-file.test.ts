import { describe, expect, it } from "vitest";

import {
  TILT_HEADER_SIZE,
  TILT_HEADER_VERSION,
  TILT_HIRES_ENTRY,
  TILT_METADATA_ENTRY,
  TILT_SENTINEL,
  TILT_SKETCH_ENTRY,
  TILT_THUMBNAIL_ENTRY,
  listTiltFileEntries,
  readTiltFile,
  writeTiltFile,
} from "./tilt-file.js";
import { createSketchDocument, createSketchLayer } from "./document.js";
import { StrokeFlags, createEmptyStrokeData } from "./types.js";

describe("Open Brush .tilt files", () => {
  it("writes the Open Brush header followed by a stored zip", () => {
    const bytes = writeTiltFile(createTiltFixtureDocument());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getUint32(0, true)).toBe(TILT_SENTINEL);
    expect(view.getUint16(4, true)).toBe(TILT_HEADER_SIZE);
    expect(view.getUint16(6, true)).toBe(TILT_HEADER_VERSION);
    expect(view.getUint32(TILT_HEADER_SIZE, true)).toBe(0x04034b50);
  });

  it("writes required .tilt entries and optional hires images", () => {
    const bytes = writeTiltFile(createTiltFixtureDocument(), {
      thumbnailPng: new Uint8Array([1, 2, 3]),
      hiresPng: new Uint8Array([4, 5, 6]),
    });

    expect(listTiltFileEntries(bytes)).toEqual([
      TILT_SKETCH_ENTRY,
      TILT_HIRES_ENTRY,
      TILT_METADATA_ENTRY,
      TILT_THUMBNAIL_ENTRY,
    ]);
  });

  it("round-trips document layers, strokes, brush index, and metadata", () => {
    const source = createTiltFixtureDocument();
    const roundTrip = readTiltFile(writeTiltFile(source));

    expect(roundTrip.metadata).toEqual({
      appName: "Open Brush IWSDK Port",
      schemaVersion: 1,
      source: "tilt",
    });
    expect(roundTrip.layers).toEqual(source.layers);
    expect(roundTrip.media).toEqual(source.media);
    expect(roundTrip.strokes).toHaveLength(1);
    const [stroke] = roundTrip.strokes;
    expect(stroke.brushGuid).toBe(source.strokes[0].brushGuid);
    expect(stroke.brushSize).toBeCloseTo(source.strokes[0].brushSize);
    expect(stroke.flags).toBe(StrokeFlags.IsGroupContinue);
    expect(stroke.seed).toBe(77);
    expect(stroke.groupId).toBe(5);
    expect(stroke.layerIndex).toBe(2);
    expect(stroke.controlPoints).toEqual(source.strokes[0].controlPoints);
  });

  it("rejects files without the Open Brush header or zip header", () => {
    expect(() => readTiltFile(new Uint8Array([1, 2, 3, 4]))).toThrow(
      "bad tilt header sentinel",
    );
  });
});

function createTiltFixtureDocument() {
  return createSketchDocument({
    metadata: { source: "runtime" },
    layers: [
      createSketchLayer({ id: 0, name: "Sketch" }),
      createSketchLayer({ id: 2, name: "Foreground", locked: true }),
    ],
    media: [
      {
        id: "reference-image",
        kind: "image",
        mediaPath: "media/reference-image/reference.png",
        originalName: "reference.png",
        mimeType: "image/png",
        byteLength: 12,
        transform: {
          position: [0, 1.25, -1],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    ],
    strokes: [
      createEmptyStrokeData({
        guid: "runtime-stroke-1",
        brushGuid: "429ed64a-4e97-4466-84d3-145a861ef684",
        brushSize: 0.42,
        flags: StrokeFlags.IsGroupContinue,
        seed: 77,
        groupId: 5,
        layerIndex: 2,
        color: [0.2, 0.4, 0.6, 1],
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
      }),
    ],
  });
}

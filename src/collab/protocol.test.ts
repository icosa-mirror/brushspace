import { describe, expect, it } from "vitest";

import {
  COLLAB_CODE_LENGTH,
  COLLAB_PEER_ID_PREFIX,
  STROKE_POINTS_PER_MESSAGE,
  chunkControlPoints,
  collabPeerId,
  generateCollabCode,
  isValidCollabCode,
  isValidStrokeData,
  parseCollabMessage,
} from "./protocol.js";
import { createEmptyStrokeData } from "../types.js";

function testStroke() {
  return createEmptyStrokeData({
    guid: "stroke-1",
    brushGuid: "429ed64a-4e97-4466-84d3-145a861ef684",
    brushSize: 0.1,
    brushScale: 1,
    color: [1, 0, 0, 1],
    controlPoints: [
      {
        position: [0, 1, -1],
        orientation: [0, 0, 0, 1],
        pressure: 1,
        timestampMs: 10,
      },
      {
        position: [0.1, 1, -1],
        orientation: [0, 0, 0, 1],
        pressure: 1,
        timestampMs: 20,
      },
    ],
  });
}

describe("collab codes", () => {
  it("generates numeric codes of the advertised length", () => {
    for (let round = 0; round < 20; round += 1) {
      const code = generateCollabCode();
      expect(code).toHaveLength(COLLAB_CODE_LENGTH);
      expect(isValidCollabCode(code)).toBe(true);
    }
  });

  it("is deterministic for a fixed random source", () => {
    expect(generateCollabCode(() => 0)).toBe("000000");
    expect(generateCollabCode(() => 0.999999)).toBe("999999");
  });

  it("rejects malformed codes", () => {
    expect(isValidCollabCode("12345")).toBe(false);
    expect(isValidCollabCode("1234567")).toBe(false);
    expect(isValidCollabCode("12345a")).toBe(false);
    expect(isValidCollabCode("")).toBe(false);
  });

  it("namespaces peer ids", () => {
    expect(collabPeerId("123456")).toBe(`${COLLAB_PEER_ID_PREFIX}123456`);
  });
});

describe("collab message parsing", () => {
  it("accepts well-formed messages", () => {
    expect(parseCollabMessage({ t: "hello", version: 1 })?.t).toBe("hello");
    expect(
      parseCollabMessage({
        t: "snapshot",
        version: 1,
        sketchName: "Shared Sketch",
        strokeCount: 3,
      })?.t,
    ).toBe("snapshot");
    expect(
      parseCollabMessage({ t: "stroke-begin", stroke: testStroke(), live: true })
        ?.t,
    ).toBe("stroke-begin");
    expect(
      parseCollabMessage({
        t: "stroke-points",
        guid: "stroke-1",
        from: 0,
        points: testStroke().controlPoints,
      })?.t,
    ).toBe("stroke-points");
    expect(
      parseCollabMessage({ t: "stroke-end", guid: "stroke-1", totalPoints: 2 })
        ?.t,
    ).toBe("stroke-end");
    expect(parseCollabMessage({ t: "stroke-drop", guid: "stroke-1" })?.t).toBe(
      "stroke-drop",
    );
    expect(
      parseCollabMessage({
        t: "visibility",
        guids: ["a", "b"],
        visible: false,
      })?.t,
    ).toBe("visibility");
    expect(
      parseCollabMessage({
        t: "tip",
        position: [0, 1, -1],
        orientation: [0, 0, 0, 1],
        drawing: true,
      })?.t,
    ).toBe("tip");
    expect(
      parseCollabMessage({
        t: "tip",
        position: [0, 1, -1],
        orientation: [0, 0, 0, 1],
        drawing: true,
        head: { position: [0, 1.6, -1], orientation: [0, 0, 0, 1] },
      })?.t,
    ).toBe("tip");
    expect(parseCollabMessage({ t: "ping" })?.t).toBe("ping");
    expect(parseCollabMessage({ t: "bye" })?.t).toBe("bye");
  });

  it("rejects junk without throwing", () => {
    expect(parseCollabMessage(undefined)).toBeUndefined();
    expect(parseCollabMessage(null)).toBeUndefined();
    expect(parseCollabMessage("hello")).toBeUndefined();
    expect(parseCollabMessage({})).toBeUndefined();
    expect(parseCollabMessage({ t: "unknown" })).toBeUndefined();
    expect(parseCollabMessage({ t: "stroke-begin", stroke: {} })).toBeUndefined();
    expect(
      parseCollabMessage({ t: "stroke-begin", stroke: testStroke() }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({ t: "stroke-end", guid: "stroke-1" }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({
        t: "stroke-points",
        guid: "stroke-1",
        from: 0,
        points: [],
      }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({
        t: "stroke-points",
        guid: "stroke-1",
        from: -1,
        points: testStroke().controlPoints,
      }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({ t: "visibility", guids: [42], visible: true }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({
        t: "tip",
        position: [0, Number.NaN, 0],
        orientation: [0, 0, 0, 1],
        drawing: false,
      }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({
        t: "tip",
        position: [0, 1, -1],
        orientation: [0, 0, 0, 1],
        drawing: false,
        head: { position: [0, 1.6], orientation: [0, 0, 0, 1] },
      }),
    ).toBeUndefined();
  });

  it("validates control points inside stroke data", () => {
    const broken = testStroke();
    (broken.controlPoints[1] as { position: unknown }).position = [0, 1];
    expect(isValidStrokeData(broken)).toBe(false);
    expect(
      parseCollabMessage({ t: "stroke-begin", stroke: broken, live: false }),
    ).toBeUndefined();
    expect(
      parseCollabMessage({
        t: "stroke-points",
        guid: "stroke-1",
        from: 0,
        points: broken.controlPoints,
      }),
    ).toBeUndefined();
  });
});

describe("stroke chunking", () => {
  it("splits long point lists into wire-safe chunks", () => {
    const point = testStroke().controlPoints[0];
    const points = Array.from({ length: 2 * STROKE_POINTS_PER_MESSAGE + 7 }, () => ({
      ...point,
    }));
    const chunks = chunkControlPoints(points);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(STROKE_POINTS_PER_MESSAGE);
    expect(chunks[2]).toHaveLength(7);
    expect(chunks.flat()).toHaveLength(points.length);
  });

  it("keeps every chunk under the PeerJS JSON channel ceiling", () => {
    // The regression this protocol exists for: PeerJS kills json-serialized
    // channels on any message >= ~16 KB, and strokes grow without bound.
    const worstPoint = {
      position: [-0.123456789012345, 1.123456789012345, -2.123456789012345],
      orientation: [
        -0.7071067811865476, 0.7071067811865476, -0.7071067811865476,
        0.7071067811865476,
      ],
      pressure: 0.123456789012345,
      timestampMs: 123456789.12345,
    };
    const points = Array.from({ length: STROKE_POINTS_PER_MESSAGE }, () => ({
      ...worstPoint,
    }));
    const message = {
      t: "stroke-points",
      guid: "stroke-12345678-1234-1234-1234-123456789012",
      from: 999999,
      points,
    };
    expect(JSON.stringify(message).length).toBeLessThan(16000);
  });

  it("handles empty point lists", () => {
    expect(chunkControlPoints([])).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { createSketchDocument, createSketchLayer } from "./document.js";
import {
  advanceSketchPlayback,
  createSketchPlaybackState,
  createSketchPlaybackTimeline,
  rewindSketchPlayback,
  seekSketchPlayback,
} from "./sketch-playback.js";
import { createEmptyStrokeData, type StrokeData } from "./types.js";

describe("Open Brush sketch playback", () => {
  it("quickloads all strokes once without duplicate visibility events", () => {
    const timeline = createSketchPlaybackTimeline(createPlaybackDocument(), {
      mode: "quickload",
    });
    const initialState = createSketchPlaybackState();
    const loadedState = advanceSketchPlayback(timeline, initialState, 0);
    const repeatedState = advanceSketchPlayback(timeline, loadedState, 0);

    expect(timeline).toMatchObject({
      mode: "quickload",
      unit: "none",
      duration: 0,
      strokeCount: 2,
    });
    expect(loadedState.visibleStrokeGuids).toEqual(["stroke-a", "stroke-b"]);
    expect(loadedState.newlyVisibleStrokeGuids).toEqual([
      "stroke-a",
      "stroke-b",
    ]);
    expect(repeatedState.visibleStrokeGuids).toEqual(["stroke-a", "stroke-b"]);
    expect(repeatedState.newlyVisibleStrokeGuids).toEqual([]);
  });

  it("scrubs timestamp playback and hides rewound strokes", () => {
    const timeline = createSketchPlaybackTimeline(createPlaybackDocument(), {
      mode: "timestamp",
    });
    const initialState = createSketchPlaybackState();
    const firstState = seekSketchPlayback(timeline, 0, initialState);
    const fullState = seekSketchPlayback(timeline, timeline.duration, firstState);
    const rewoundState = rewindSketchPlayback(timeline, fullState);

    expect(timeline).toMatchObject({
      unit: "ms",
      duration: 200,
    });
    expect(firstState.visibleStrokeGuids).toEqual(["stroke-a"]);
    expect(fullState.visibleStrokeGuids).toEqual(["stroke-a", "stroke-b"]);
    expect(fullState.newlyVisibleStrokeGuids).toEqual(["stroke-b"]);
    expect(rewoundState.visibleStrokeGuids).toEqual(["stroke-a"]);
    expect(rewoundState.hiddenStrokeGuids).toEqual(["stroke-b"]);
  });

  it("reveals strokes by accumulated distance", () => {
    const timeline = createSketchPlaybackTimeline(createPlaybackDocument(), {
      mode: "distance",
    });
    const initialState = createSketchPlaybackState();
    const firstState = seekSketchPlayback(timeline, 0, initialState);
    const secondState = seekSketchPlayback(timeline, 1, firstState);

    expect(timeline).toMatchObject({
      unit: "meters",
      duration: 2,
    });
    expect(firstState.visibleStrokeGuids).toEqual(["stroke-a"]);
    expect(secondState.visibleStrokeGuids).toEqual(["stroke-a", "stroke-b"]);
    expect(secondState.newlyVisibleStrokeGuids).toEqual(["stroke-b"]);
  });

  it("reports missing brushes without blocking playback", () => {
    const timeline = createSketchPlaybackTimeline(createPlaybackDocument(), {
      mode: "quickload",
      hasBrush: (brushGuid) => brushGuid === "brush-known",
    });
    const state = advanceSketchPlayback(
      timeline,
      createSketchPlaybackState(),
      0,
    );

    expect(timeline.missingBrushCount).toBe(1);
    expect(timeline.warnings[0]).toContain("missing brush brush-missing");
    expect(state.visibleStrokeGuids).toEqual(["stroke-a", "stroke-b"]);
  });
});

function createPlaybackDocument() {
  return createSketchDocument({
    metadata: { source: "runtime" },
    layers: [createSketchLayer({ id: 0, name: "Sketch" })],
    strokes: [
      createStroke({
        guid: "stroke-a",
        brushGuid: "brush-known",
        startTimestampMs: 100,
        endTimestampMs: 150,
        startX: 0,
        endX: 1,
      }),
      createStroke({
        guid: "stroke-b",
        brushGuid: "brush-missing",
        startTimestampMs: 250,
        endTimestampMs: 300,
        startX: 1,
        endX: 2,
      }),
    ],
  });
}

function createStroke({
  guid,
  brushGuid,
  startTimestampMs,
  endTimestampMs,
  startX,
  endX,
}: {
  guid: string;
  brushGuid: string;
  startTimestampMs: number;
  endTimestampMs: number;
  startX: number;
  endX: number;
}): StrokeData {
  return createEmptyStrokeData({
    guid,
    brushGuid,
    controlPoints: [
      {
        position: [startX, 1, -1],
        orientation: [0, 0, 0, 1],
        pressure: 0.5,
        timestampMs: startTimestampMs,
      },
      {
        position: [endX, 1, -1],
        orientation: [0, 0, 0, 1],
        pressure: 1,
        timestampMs: endTimestampMs,
      },
    ],
  });
}

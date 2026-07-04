import { describe, expect, it } from "vitest";

import {
  MemorySketchCatalogStore,
  createSketchCatalogRecord,
  createSketchCatalogRecordFromTiltBytes,
  readSketchCatalogRecordDocument,
  searchSketchCatalogItems,
} from "./sketch-catalog.js";
import { createSketchDocument, createSketchLayer } from "./document.js";
import { PHASE1_FIXTURE_BRUSH_GUID } from "./fixtures.js";
import { writeTiltFile } from "./tilt-file.js";
import { createEmptyStrokeData } from "./types.js";

describe("Open Brush sketch catalog", () => {
  it("creates catalog records with .tilt bytes and document summaries", () => {
    const document = createCatalogDocument();
    const record = createSketchCatalogRecord({
      id: "sketch-a",
      name: "Sketch A",
      document,
      nowMs: 1000,
      thumbnailPng: new Uint8Array([1, 2, 3]),
    });

    expect(record.summary).toEqual({
      layerCount: 1,
      strokeCount: 1,
      controlPointCount: 2,
      brushGuidCount: 1,
    });
    expect(record.thumbnailPng).toEqual(new Uint8Array([1, 2, 3]));
    expect(readSketchCatalogRecordDocument(record).strokes[0].brushGuid).toBe(
      PHASE1_FIXTURE_BRUSH_GUID,
    );
  });

  it("saves and loads clone-safe records", async () => {
    const store = new MemorySketchCatalogStore();
    const record = createSketchCatalogRecord({
      id: "sketch-a",
      name: "Sketch A",
      document: createCatalogDocument(),
      nowMs: 1000,
    });

    await store.save(record);
    const loaded = await store.load("sketch-a");
    expect(loaded?.name).toBe("Sketch A");
    loaded!.tiltBytes[0] = 0;

    const loadedAgain = await store.load("sketch-a");
    expect(loadedAgain?.tiltBytes[0]).not.toBe(0);
  });

  it("lists, renames, duplicates, and deletes records", async () => {
    const store = new MemorySketchCatalogStore();
    await store.save(
      createSketchCatalogRecord({
        id: "old",
        name: "Old",
        document: createCatalogDocument(),
        nowMs: 1000,
      }),
    );
    await store.save(
      createSketchCatalogRecord({
        id: "new",
        name: "New",
        document: createCatalogDocument(),
        nowMs: 2000,
      }),
    );

    expect((await store.list()).map((record) => record.id)).toEqual([
      "new",
      "old",
    ]);
    expect(await store.rename("old", "Renamed", 3000)).toBe(true);
    expect((await store.list())[0]).toMatchObject({
      id: "old",
      name: "Renamed",
      updatedAtMs: 3000,
    });

    const duplicate = await store.duplicate("old", "copy", "Copy", 4000);
    expect(duplicate).toMatchObject({
      id: "copy",
      name: "Copy",
      createdAtMs: 4000,
      updatedAtMs: 4000,
    });
    expect(await store.delete("new")).toBe(true);
    expect(await store.load("new")).toBeUndefined();
  });

  it("imports copied .tilt bytes and searches catalog metadata", async () => {
    const document = createCatalogDocument();
    const tiltBytes = writeTiltFile(document);
    const record = createSketchCatalogRecordFromTiltBytes({
      id: "import-1",
      name: "Imported Tilt",
      tiltBytes,
      nowMs: 7000,
    });
    tiltBytes[0] = 0;

    expect(record.summary.strokeCount).toBe(1);
    expect(record.tiltBytes[0]).not.toBe(0);
    expect(readSketchCatalogRecordDocument(record).layers[0].name).toBe(
      "Sketch",
    );

    const store = new MemorySketchCatalogStore();
    await store.save(record);
    const items = await store.list();
    expect(searchSketchCatalogItems(items, "imported")).toHaveLength(1);
    expect(searchSketchCatalogItems(items, "1 strokes")).toHaveLength(1);
    expect(searchSketchCatalogItems(items, "missing")).toHaveLength(0);
  });
});

function createCatalogDocument() {
  return createSketchDocument({
    metadata: { source: "runtime" },
    layers: [createSketchLayer({ id: 0, name: "Sketch" })],
    strokes: [
      createEmptyStrokeData({
        guid: "catalog-stroke",
        brushGuid: PHASE1_FIXTURE_BRUSH_GUID,
        layerIndex: 0,
        controlPoints: [
          {
            position: [0, 1, -1],
            orientation: [0, 0, 0, 1],
            pressure: 0.5,
            timestampMs: 100,
          },
          {
            position: [0.2, 1.1, -1.1],
            orientation: [0, 0, 0, 1],
            pressure: 1,
            timestampMs: 150,
          },
        ],
      }),
    ],
  });
}

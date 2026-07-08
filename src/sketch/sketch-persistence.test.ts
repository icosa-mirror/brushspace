import { describe, expect, it } from "vitest";

import { createPhase1FixtureDocument, PHASE1_FIXTURE_BRUSH_GUID } from "./fixtures.js";
import {
  MemorySketchCatalogStore,
  readSketchCatalogRecordDocument,
} from "./sketch-catalog.js";
import { SketchPersistenceController } from "./sketch-persistence.js";
import { readTiltFile, writeTiltFile } from "./tilt-file.js";

describe("Open Brush sketch persistence workflow", () => {
  it("saves sketches, tracks active metadata, and exports .tilt bytes", async () => {
    const store = new MemorySketchCatalogStore();
    const controller = createController(store);
    const document = createPhase1FixtureDocument();

    const snapshot = await controller.save({
      id: "sketch-1",
      name: "First Sketch",
      document,
      thumbnailPng: new Uint8Array([9, 8, 7]),
    });

    expect(snapshot).toMatchObject({
      activeSketchId: "sketch-1",
      activeSketchName: "First Sketch",
      status: "saved",
      catalogEntryCount: 1,
      saveRevision: 1,
      lastSavedAtMs: 1000,
      lastThumbnailByteLength: 3,
      isDirty: false,
    });
    expect(snapshot.lastSummary).toMatchObject({ layerCount: 2, strokeCount: 1 });

    const exported = await controller.exportTilt();
    expect(exported.snapshot).toMatchObject({
      status: "exported",
      exportRevision: 1,
      lastExportedAtMs: 2000,
    });
    expect(readTiltFile(exported.bytes).strokes[0].brushGuid).toBe(
      PHASE1_FIXTURE_BRUSH_GUID,
    );
  });

  it("imports .tilt bytes, searches catalog metadata, and reloads records", async () => {
    const store = new MemorySketchCatalogStore();
    const controller = createController(store);
    const tiltBytes = writeTiltFile(createPhase1FixtureDocument());

    await controller.importTilt({
      id: "import-1",
      name: "Imported Sketch",
      tiltBytes,
    });
    tiltBytes[0] = 0;

    expect(controller.snapshot).toMatchObject({
      activeSketchId: "import-1",
      status: "imported",
      loadRevision: 1,
      catalogEntryCount: 1,
    });
    expect((await controller.list("1 strokes")).map((item) => item.id)).toEqual([
      "import-1",
    ]);

    await controller.saveAs({ id: "copy-1", name: "Imported Copy" });
    expect((await controller.list()).map((item) => item.id)).toEqual([
      "copy-1",
      "import-1",
    ]);

    const loaded = await controller.load("import-1");
    expect(loaded).toMatchObject({
      activeSketchId: "import-1",
      status: "loaded",
      loadRevision: 2,
    });
    expect(controller.document.layers[1].name).toBe("Reference");
  });

  it("keeps the previous catalog entry readable when a save fails", async () => {
    const store = new MemorySketchCatalogStore();
    const controller = createController(store);
    await controller.save({
      id: "stable",
      name: "Stable Sketch",
      document: createPhase1FixtureDocument(),
    });

    const invalidDocument = createPhase1FixtureDocument();
    invalidDocument.strokes[0].brushGuid = "not-a-guid";
    await expect(
      controller.save({ document: invalidDocument, name: "Broken Save" }),
    ).rejects.toThrow("Invalid GUID");

    expect(controller.snapshot.status).toBe("error");
    const stableRecord = await store.load("stable");
    expect(stableRecord?.name).toBe("Stable Sketch");
    expect(readSketchCatalogRecordDocument(stableRecord!).strokes[0].brushGuid).toBe(
      PHASE1_FIXTURE_BRUSH_GUID,
    );
  });

  it("renames, duplicates, and deletes catalog entries", async () => {
    const store = new MemorySketchCatalogStore();
    const controller = createController(store);
    await controller.save({
      id: "sketch-1",
      name: "Sketch",
      document: createPhase1FixtureDocument(),
    });

    expect(await controller.rename("sketch-1", "Renamed")).toBe(true);
    expect(controller.snapshot).toMatchObject({
      activeSketchName: "Renamed",
      status: "renamed",
    });

    const duplicate = await controller.duplicate("sketch-1", "copy-1", "Copy");
    expect(duplicate).toMatchObject({
      activeSketchId: "copy-1",
      status: "duplicated",
      catalogEntryCount: 2,
    });

    expect(await controller.delete("copy-1")).toBe(true);
    expect(controller.snapshot).toMatchObject({
      activeSketchId: "",
      activeSketchName: "Untitled Sketch",
      status: "deleted",
      catalogEntryCount: 1,
    });
  });
});

function createController(store: MemorySketchCatalogStore) {
  let nowMs = 0;
  return new SketchPersistenceController(store, {
    idFactory: () => "generated-id",
    nowMs: () => {
      nowMs += 1000;
      return nowMs;
    },
  });
}

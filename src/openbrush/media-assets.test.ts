import { describe, expect, it } from "vitest";

import {
  MemoryMediaAssetStore,
  assertManagedMediaPath,
  createManagedMediaPath,
  createReferenceMediaAsset,
  resolveMediaAssets,
  toMediaReference,
} from "./media-assets.js";

describe("Open Brush media assets", () => {
  it("creates clone-safe reference media assets under the managed root", async () => {
    const sourceBytes = new Uint8Array([1, 2, 3]);
    const asset = createReferenceMediaAsset({
      id: "ref-image",
      kind: "image",
      fileName: "reference.png",
      mimeType: "image/png",
      bytes: sourceBytes,
      transform: { position: [1, 2, 3] },
    });
    sourceBytes[0] = 9;

    expect(asset).toMatchObject({
      id: "ref-image",
      kind: "image",
      mediaPath: "media/ref-image/reference.png",
      originalName: "reference.png",
      mimeType: "image/png",
      byteLength: 3,
    });
    expect(asset.bytes[0]).toBe(1);
    expect(asset.transform).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    });

    const store = new MemoryMediaAssetStore();
    await store.save(asset);
    const loaded = await store.load("ref-image");
    loaded!.bytes[0] = 7;
    expect((await store.load("ref-image"))!.bytes[0]).toBe(1);
  });

  it("rejects unsafe file names and unmanaged paths", () => {
    expect(createManagedMediaPath("ref 1", "my image.png")).toBe(
      "media/ref_1/my_image.png",
    );
    expect(() =>
      createReferenceMediaAsset({
        id: "bad",
        kind: "model",
        fileName: "../escape.glb",
        mimeType: "model/gltf-binary",
        bytes: new Uint8Array(),
      }),
    ).toThrow("path separators");
    expect(() => assertManagedMediaPath("/media/ref/file.png")).toThrow(
      "relative",
    );
    expect(() => assertManagedMediaPath("media/ref/../file.png")).toThrow(
      "unsafe segment",
    );
    expect(() => assertManagedMediaPath("outside/ref/file.png")).toThrow(
      "media/",
    );
  });

  it("resolves available media and reports missing references", async () => {
    const store = new MemoryMediaAssetStore();
    const asset = createReferenceMediaAsset({
      id: "available",
      kind: "model",
      fileName: "reference.glb",
      mimeType: "model/gltf-binary",
      bytes: new Uint8Array([1]),
    });
    await store.save(asset);

    const resolved = await resolveMediaAssets(
      [
        toMediaReference(asset),
        {
          ...toMediaReference(asset),
          id: "missing",
          mediaPath: "media/missing/reference.glb",
        },
      ],
      store,
    );

    expect(resolved.assets.map((item) => item.id)).toEqual(["available"]);
    expect(resolved.warnings).toEqual([
      "Missing media missing at media/missing/reference.glb; keeping reference metadata.",
    ]);
  });
});

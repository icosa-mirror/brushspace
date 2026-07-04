import {
  createSketchDocument,
  createSketchLayer,
  type SketchDocument,
  type SketchLayer,
  type SketchMetadata,
} from "./document.js";
import { normalizeGuid } from "./binary.js";
import { readSketchMemory, writeSketchMemory } from "./sketch-memory.js";

export const TILT_SENTINEL = 0x546c6974;
export const TILT_HEADER_SIZE = 16;
export const TILT_HEADER_VERSION = 1;

export const TILT_METADATA_ENTRY = "metadata.json";
export const TILT_SKETCH_ENTRY = "data.sketch";
export const TILT_THUMBNAIL_ENTRY = "thumbnail.png";
export const TILT_HIRES_ENTRY = "hires.png";

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION_STORED = 20;

export interface TiltFileWriteOptions {
  thumbnailPng?: Uint8Array;
  hiresPng?: Uint8Array;
}

export interface TiltFileMetadata {
  BrushIndex: string[];
  OpenBrushIwSdk?: {
    appName: string;
    schemaVersion: number;
    source: SketchMetadata["source"];
    layers: SketchLayer[];
  };
}

interface ZipEntryPayload {
  name: string;
  bytes: Uint8Array;
  crc32: number;
  localHeaderOffset: number;
}

export function writeTiltFile(
  document: SketchDocument,
  options: TiltFileWriteOptions = {},
): Uint8Array {
  const sketchPayload = writeSketchMemory(document.strokes);
  const metadata: TiltFileMetadata = {
    BrushIndex: sketchPayload.brushGuids.map(normalizeGuid),
    OpenBrushIwSdk: {
      appName: document.metadata.appName,
      schemaVersion: document.metadata.schemaVersion,
      source: document.metadata.source,
      layers: document.layers.map((layer) => ({ ...layer })),
    },
  };
  const entries: Array<{ name: string; bytes: Uint8Array }> = [
    { name: TILT_SKETCH_ENTRY, bytes: sketchPayload.bytes },
    { name: TILT_METADATA_ENTRY, bytes: encodeJson(metadata) },
    {
      name: TILT_THUMBNAIL_ENTRY,
      bytes: options.thumbnailPng ?? DEFAULT_THUMBNAIL_PNG,
    },
  ];
  if (options.hiresPng) {
    entries.push({ name: TILT_HIRES_ENTRY, bytes: options.hiresPng });
  }

  const zipBytes = writeStoredZip(entries);
  const writer = new BinaryByteWriter();
  writer.writeUint32(TILT_SENTINEL);
  writer.writeUint16(TILT_HEADER_SIZE);
  writer.writeUint16(TILT_HEADER_VERSION);
  writer.writeUint32(0);
  writer.writeUint32(0);
  writer.writeBytes(zipBytes);
  return writer.toUint8Array();
}

export function readTiltFile(bytes: Uint8Array): SketchDocument {
  const entries = readStoredZip(bytes);
  const metadataBytes = entries.get(TILT_METADATA_ENTRY);
  const sketchBytes = entries.get(TILT_SKETCH_ENTRY);
  if (!metadataBytes) {
    throw new Error("Invalid Open Brush .tilt: missing metadata.json");
  }
  if (!sketchBytes) {
    throw new Error("Invalid Open Brush .tilt: missing data.sketch");
  }

  const metadata = decodeJson<TiltFileMetadata>(metadataBytes);
  const brushGuids = readBrushIndex(metadata);
  const strokes = readSketchMemory(sketchBytes, brushGuids);
  const layers = readLayers(metadata, strokes.map((stroke) => stroke.layerIndex));
  return createSketchDocument({
    metadata: {
      appName:
        metadata.OpenBrushIwSdk?.appName ?? "Open Brush IWSDK Port",
      schemaVersion: metadata.OpenBrushIwSdk?.schemaVersion ?? 1,
      source: "tilt",
    },
    layers,
    strokes,
  });
}

export function listTiltFileEntries(bytes: Uint8Array): string[] {
  return Array.from(readStoredZip(bytes).keys()).sort();
}

function readBrushIndex(metadata: TiltFileMetadata): string[] {
  if (!Array.isArray(metadata.BrushIndex)) {
    throw new Error("Invalid Open Brush .tilt metadata: BrushIndex missing");
  }
  return metadata.BrushIndex.map(normalizeGuid);
}

function readLayers(
  metadata: TiltFileMetadata,
  strokeLayerIndexes: readonly number[],
): SketchLayer[] {
  const layers = metadata.OpenBrushIwSdk?.layers;
  if (Array.isArray(layers) && layers.length > 0) {
    return layers.map((layer) =>
      createSketchLayer({
        id: Number(layer.id),
        name: String(layer.name),
        visible: Boolean(layer.visible),
        locked: Boolean(layer.locked),
      }),
    );
  }

  const layerIds = Array.from(new Set(strokeLayerIndexes)).sort((a, b) => a - b);
  if (layerIds.length === 0) {
    layerIds.push(0);
  }
  return layerIds.map((id) =>
    createSketchLayer({
      id,
      name: id === 0 ? "Layer 1" : `Layer ${id}`,
    }),
  );
}

function writeStoredZip(
  entries: Array<{ name: string; bytes: Uint8Array }>,
): Uint8Array {
  const writer = new BinaryByteWriter();
  const payloads: ZipEntryPayload[] = [];
  for (const entry of entries) {
    const nameBytes = encodeAscii(entry.name);
    const crc32 = computeCrc32(entry.bytes);
    const localHeaderOffset = writer.byteLength;
    writer.writeUint32(ZIP_LOCAL_FILE_HEADER);
    writer.writeUint16(ZIP_VERSION_STORED);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint32(crc32);
    writer.writeUint32(entry.bytes.byteLength);
    writer.writeUint32(entry.bytes.byteLength);
    writer.writeUint16(nameBytes.byteLength);
    writer.writeUint16(0);
    writer.writeBytes(nameBytes);
    writer.writeBytes(entry.bytes);
    payloads.push({
      name: entry.name,
      bytes: entry.bytes,
      crc32,
      localHeaderOffset,
    });
  }

  const centralDirectoryOffset = writer.byteLength;
  for (const entry of payloads) {
    const nameBytes = encodeAscii(entry.name);
    writer.writeUint32(ZIP_CENTRAL_DIRECTORY_HEADER);
    writer.writeUint16(ZIP_VERSION_STORED);
    writer.writeUint16(ZIP_VERSION_STORED);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint32(entry.crc32);
    writer.writeUint32(entry.bytes.byteLength);
    writer.writeUint32(entry.bytes.byteLength);
    writer.writeUint16(nameBytes.byteLength);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint16(0);
    writer.writeUint32(0);
    writer.writeUint32(entry.localHeaderOffset);
    writer.writeBytes(nameBytes);
  }
  const centralDirectorySize = writer.byteLength - centralDirectoryOffset;

  writer.writeUint32(ZIP_END_OF_CENTRAL_DIRECTORY);
  writer.writeUint16(0);
  writer.writeUint16(0);
  writer.writeUint16(payloads.length);
  writer.writeUint16(payloads.length);
  writer.writeUint32(centralDirectorySize);
  writer.writeUint32(centralDirectoryOffset);
  writer.writeUint16(0);
  return writer.toUint8Array();
}

function readStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const zipStart = getZipStartOffset(bytes);
  const view = dataView(bytes);
  const eocdOffset = findEndOfCentralDirectory(bytes, zipStart);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let cursor = zipStart + centralDirectoryOffset;
  const entries = new Map<string, Uint8Array>();

  for (let index = 0; index < entryCount; index += 1) {
    requireSignature(view, cursor, ZIP_CENTRAL_DIRECTORY_HEADER);
    const compressionMethod = view.getUint16(cursor + 10, true);
    if (compressionMethod !== 0) {
      throw new Error(
        `Unsupported Open Brush .tilt zip compression method: ${compressionMethod}`,
      );
    }
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    if (compressedSize !== uncompressedSize) {
      throw new Error("Invalid Open Brush .tilt zip: compressed size mismatch");
    }
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const name = decodeUtf8(
      sliceBytes(bytes, cursor + 46, cursor + 46 + nameLength),
    );
    const localOffset = zipStart + localHeaderOffset;
    requireSignature(view, localOffset, ZIP_LOCAL_FILE_HEADER);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, sliceBytes(bytes, dataOffset, dataOffset + compressedSize));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function getZipStartOffset(bytes: Uint8Array): number {
  const view = dataView(bytes);
  const firstWord = view.getUint32(0, true);
  if (firstWord === ZIP_LOCAL_FILE_HEADER) {
    return 0;
  }
  if (firstWord !== TILT_SENTINEL) {
    throw new Error("Invalid Open Brush .tilt: bad tilt header sentinel");
  }
  const headerSize = view.getUint16(4, true);
  const headerVersion = view.getUint16(6, true);
  if (headerVersion !== TILT_HEADER_VERSION) {
    throw new Error(`Unsupported Open Brush .tilt header version: ${headerVersion}`);
  }
  if (headerSize < TILT_HEADER_SIZE) {
    throw new Error(`Invalid Open Brush .tilt header size: ${headerSize}`);
  }
  requireSignature(view, headerSize, ZIP_LOCAL_FILE_HEADER);
  return headerSize;
}

function findEndOfCentralDirectory(bytes: Uint8Array, zipStart: number): number {
  const view = dataView(bytes);
  for (let offset = bytes.byteLength - 22; offset >= zipStart; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_END_OF_CENTRAL_DIRECTORY) {
      return offset;
    }
  }
  throw new Error("Invalid Open Brush .tilt zip: missing central directory");
}

function requireSignature(view: DataView, offset: number, signature: number): void {
  if (offset < 0 || offset + 4 > view.byteLength) {
    throw new Error("Invalid Open Brush .tilt zip: read past end");
  }
  const actual = view.getUint32(offset, true);
  if (actual !== signature) {
    throw new Error(`Invalid Open Brush .tilt zip signature: 0x${actual.toString(16)}`);
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(decodeUtf8(bytes)) as T;
}

function encodeAscii(value: string): Uint8Array {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) {
      throw new Error(`ZIP entry name must be ASCII: ${value}`);
    }
  }
  return new TextEncoder().encode(value);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function sliceBytes(bytes: Uint8Array, start: number, end: number): Uint8Array {
  if (start < 0 || end < start || end > bytes.byteLength) {
    throw new Error("Invalid Open Brush .tilt zip: entry range is out of bounds");
  }
  return new Uint8Array(bytes.slice(start, end));
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

class BinaryByteWriter {
  private bytes: number[] = [];

  get byteLength(): number {
    return this.bytes.length;
  }

  writeUint16(value: number): void {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  writeUint32(value: number): void {
    this.bytes.push(
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    );
  }

  writeBytes(bytes: Uint8Array): void {
    for (const byte of bytes) {
      this.bytes.push(byte);
    }
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const DEFAULT_THUMBNAIL_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
  120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 42, 180, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130,
]);

import type { ControlPoint, Quat, Rgba, Vec3 } from "../types.js";

export const SKETCH_SENTINEL = 0xc576a5cd;
export const SKETCH_VERSION = 5;

const GUID_RE =
  /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i;

export function normalizeGuid(guid: string): string {
  const match = GUID_RE.exec(guid);
  if (!match) {
    throw new Error(`Invalid GUID: ${guid}`);
  }
  return guid.toLowerCase();
}

export function guidStringToDotNetBytes(guid: string): Uint8Array {
  const normalized = normalizeGuid(guid);
  const hex = normalized.replace(/-/g, "");
  const bytes = new Uint8Array(16);

  bytes[0] = parseHexByte(hex, 6);
  bytes[1] = parseHexByte(hex, 4);
  bytes[2] = parseHexByte(hex, 2);
  bytes[3] = parseHexByte(hex, 0);
  bytes[4] = parseHexByte(hex, 10);
  bytes[5] = parseHexByte(hex, 8);
  bytes[6] = parseHexByte(hex, 14);
  bytes[7] = parseHexByte(hex, 12);
  for (let i = 8; i < 16; i += 1) {
    bytes[i] = parseHexByte(hex, i * 2);
  }

  return bytes;
}

export function dotNetBytesToGuidString(bytes: Uint8Array): string {
  if (bytes.byteLength !== 16) {
    throw new Error(`Expected 16 GUID bytes, received ${bytes.byteLength}`);
  }

  const hex = Array.from(bytes, byteToHex);
  return [
    hex[3] + hex[2] + hex[1] + hex[0],
    hex[5] + hex[4],
    hex[7] + hex[6],
    hex[8] + hex[9],
    hex.slice(10).join(""),
  ].join("-");
}

export class OpenBrushBinaryWriter {
  private bytes: number[] = [];
  private scratch = new ArrayBuffer(4);
  private view = new DataView(this.scratch);

  writeUint32(value: number): void {
    this.view.setUint32(0, value >>> 0, true);
    this.writeScratch4();
  }

  writeInt32(value: number): void {
    this.view.setInt32(0, value | 0, true);
    this.writeScratch4();
  }

  writeFloat32(value: number): void {
    this.view.setFloat32(0, value, true);
    this.writeScratch4();
  }

  writeGuid(guid: string): void {
    this.writeBytes(guidStringToDotNetBytes(guid));
  }

  writeVec3(value: Vec3): void {
    this.writeFloat32(value[0]);
    this.writeFloat32(value[1]);
    this.writeFloat32(value[2]);
  }

  writeQuaternion(value: Quat): void {
    this.writeFloat32(value[0]);
    this.writeFloat32(value[1]);
    this.writeFloat32(value[2]);
    this.writeFloat32(value[3]);
  }

  writeColor(value: Rgba): void {
    this.writeFloat32(value[0]);
    this.writeFloat32(value[1]);
    this.writeFloat32(value[2]);
    this.writeFloat32(value[3]);
  }

  writeControlPoint(value: ControlPoint): void {
    this.writeVec3(value.position);
    this.writeQuaternion(value.orientation);
    this.writeFloat32(value.pressure);
    this.writeUint32(value.timestampMs);
  }

  writeBytes(bytes: Uint8Array): void {
    for (const byte of bytes) {
      this.bytes.push(byte);
    }
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }

  private writeScratch4(): void {
    const scratch = new Uint8Array(this.scratch);
    this.bytes.push(scratch[0], scratch[1], scratch[2], scratch[3]);
  }
}

export class OpenBrushBinaryReader {
  private view: DataView;
  private offset = 0;

  constructor(bytes: Uint8Array | ArrayBuffer) {
    if (bytes instanceof Uint8Array) {
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } else {
      this.view = new DataView(bytes);
    }
  }

  get position(): number {
    return this.offset;
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  readUint32(): number {
    this.requireBytes(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readInt32(): number {
    this.requireBytes(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat32(): number {
    this.requireBytes(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readGuid(): string {
    return dotNetBytesToGuidString(this.readBytes(16));
  }

  readVec3(): Vec3 {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32()];
  }

  readQuaternion(): Quat {
    return [
      this.readFloat32(),
      this.readFloat32(),
      this.readFloat32(),
      this.readFloat32(),
    ];
  }

  readColor(): Rgba {
    return [
      this.readFloat32(),
      this.readFloat32(),
      this.readFloat32(),
      this.readFloat32(),
    ];
  }

  readControlPoint(): ControlPoint {
    return {
      position: this.readVec3(),
      orientation: this.readQuaternion(),
      pressure: this.readFloat32(),
      timestampMs: this.readUint32(),
    };
  }

  readBytes(length: number): Uint8Array {
    this.requireBytes(length);
    const bytes = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    );
    this.offset += length;
    return new Uint8Array(bytes);
  }

  skip(length: number): void {
    this.requireBytes(length);
    this.offset += length;
  }

  private requireBytes(length: number): void {
    if (length < 0 || this.offset + length > this.view.byteLength) {
      throw new Error(
        `Open Brush binary read past end: requested ${length} bytes with ${this.remaining} remaining`,
      );
    }
  }
}

function parseHexByte(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

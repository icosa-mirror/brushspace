import type {
  SketchMediaKind,
  SketchMediaReference,
  SketchMediaTransform,
} from "./document.js";
import type { Quat, Vec3 } from "./types.js";

export const MANAGED_MEDIA_ROOT = "media";

export interface ReferenceMediaAsset extends SketchMediaReference {
  bytes: Uint8Array;
}

export interface CreateReferenceMediaAssetOptions {
  id: string;
  kind: SketchMediaKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  transform?: Partial<SketchMediaTransform>;
}

export interface MediaAssetStore {
  save(asset: ReferenceMediaAsset): Promise<void>;
  load(id: string): Promise<ReferenceMediaAsset | undefined>;
  list(): Promise<ReferenceMediaAsset[]>;
  delete(id: string): Promise<boolean>;
}

export interface ResolvedMediaAssets {
  assets: ReferenceMediaAsset[];
  warnings: string[];
}

export function createReferenceMediaAsset({
  id,
  kind,
  fileName,
  mimeType,
  bytes,
  transform,
}: CreateReferenceMediaAssetOptions): ReferenceMediaAsset {
  const mediaPath = createManagedMediaPath(id, fileName);
  return {
    id,
    kind,
    mediaPath,
    originalName: fileName,
    mimeType,
    byteLength: bytes.byteLength,
    transform: createMediaTransform(transform),
    bytes: new Uint8Array(bytes),
  };
}

export function createManagedMediaPath(id: string, fileName: string): string {
  const safeId = sanitizeMediaSegment(id, "media id");
  const safeFileName = sanitizeMediaFileName(fileName);
  return `${MANAGED_MEDIA_ROOT}/${safeId}/${safeFileName}`;
}

export function assertManagedMediaPath(mediaPath: string): string {
  const normalized = mediaPath.replace(/\\/g, "/");
  if (normalized !== mediaPath) {
    throw new Error(`Media path must use forward slashes: ${mediaPath}`);
  }
  if (normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) {
    throw new Error(`Media path must be relative: ${mediaPath}`);
  }
  const segments = normalized.split("/");
  if (segments[0] !== MANAGED_MEDIA_ROOT) {
    throw new Error(`Media path must stay under ${MANAGED_MEDIA_ROOT}/`);
  }
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error(`Media path contains unsafe segment: ${mediaPath}`);
    }
  }
  return normalized;
}

export function isManagedMediaPath(mediaPath: string): boolean {
  try {
    assertManagedMediaPath(mediaPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveMediaAssets(
  references: readonly SketchMediaReference[],
  store: MediaAssetStore,
): Promise<ResolvedMediaAssets> {
  const assets: ReferenceMediaAsset[] = [];
  const warnings: string[] = [];
  for (const reference of references) {
    const asset = await store.load(reference.id);
    if (!asset) {
      warnings.push(
        `Missing media ${reference.id} at ${reference.mediaPath}; keeping reference metadata.`,
      );
      continue;
    }
    assets.push(asset);
  }
  return { assets, warnings };
}

export class MemoryMediaAssetStore implements MediaAssetStore {
  private readonly assets = new Map<string, ReferenceMediaAsset>();

  async save(asset: ReferenceMediaAsset): Promise<void> {
    this.assets.set(asset.id, cloneReferenceMediaAsset(asset));
  }

  async load(id: string): Promise<ReferenceMediaAsset | undefined> {
    const asset = this.assets.get(id);
    return asset ? cloneReferenceMediaAsset(asset) : undefined;
  }

  async list(): Promise<ReferenceMediaAsset[]> {
    return Array.from(this.assets.values(), cloneReferenceMediaAsset).sort(
      (left, right) => left.mediaPath.localeCompare(right.mediaPath),
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.assets.delete(id);
  }
}

export function cloneReferenceMediaAsset(
  asset: ReferenceMediaAsset,
): ReferenceMediaAsset {
  return {
    ...asset,
    transform: cloneMediaTransform(asset.transform),
    bytes: new Uint8Array(asset.bytes),
  };
}

export function toMediaReference(
  asset: ReferenceMediaAsset,
): SketchMediaReference {
  return {
    id: asset.id,
    kind: asset.kind,
    mediaPath: asset.mediaPath,
    originalName: asset.originalName,
    mimeType: asset.mimeType,
    byteLength: asset.byteLength,
    transform: cloneMediaTransform(asset.transform),
  };
}

function createMediaTransform(
  transform: Partial<SketchMediaTransform> = {},
): SketchMediaTransform {
  return {
    position: cloneVec3(transform.position ?? [0, 1, -1]),
    rotation: cloneQuat(transform.rotation ?? [0, 0, 0, 1]),
    scale: cloneVec3(transform.scale ?? [1, 1, 1]),
  };
}

function cloneMediaTransform(
  transform: SketchMediaTransform,
): SketchMediaTransform {
  return {
    position: cloneVec3(transform.position),
    rotation: cloneQuat(transform.rotation),
    scale: cloneVec3(transform.scale),
  };
}

function sanitizeMediaFileName(fileName: string): string {
  if (fileName.includes("/") || fileName.includes("\\")) {
    throw new Error(`Media file name cannot include path separators: ${fileName}`);
  }
  return sanitizeMediaSegment(fileName, "media file name");
}

function sanitizeMediaSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes(":")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cloneVec3(value: Vec3): Vec3 {
  return [...value] as Vec3;
}

function cloneQuat(value: Quat): Quat {
  return [...value] as Quat;
}

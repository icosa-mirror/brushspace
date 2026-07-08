import {
  createSketchDocument,
  summarizeSketchDocument,
  type SketchDocument,
  type SketchDocumentSummary,
  type SketchLayer,
  type SketchMediaReference,
} from "./document.js";
import {
  createSketchCatalogRecord,
  createSketchCatalogRecordFromTiltBytes,
  readSketchCatalogRecordDocument,
  searchSketchCatalogItems,
  type SketchCatalogListItem,
  type SketchCatalogRecord,
  type SketchCatalogStore,
} from "./sketch-catalog.js";
import {
  writeTiltFile,
  type TiltFileWriteOptions,
} from "./tilt-file.js";
import type { ControlPoint, Quat, Rgba, StrokeData, Vec3 } from "../types.js";

export type SketchPersistenceStatus =
  | "idle"
  | "saved"
  | "loaded"
  | "imported"
  | "exported"
  | "renamed"
  | "duplicated"
  | "deleted"
  | "error";

export interface SketchPersistenceSnapshot {
  activeSketchId: string;
  activeSketchName: string;
  status: SketchPersistenceStatus;
  error: string;
  catalogEntryCount: number;
  saveRevision: number;
  loadRevision: number;
  exportRevision: number;
  lastSavedAtMs: number;
  lastLoadedAtMs: number;
  lastExportedAtMs: number;
  lastTiltByteLength: number;
  lastThumbnailByteLength: number;
  lastSummary: SketchDocumentSummary;
  isDirty: boolean;
}

export interface SketchPersistenceControllerOptions {
  defaultName?: string;
  idFactory?: () => string;
  initialDocument?: SketchDocument;
  nowMs?: () => number;
}

export interface SaveSketchOptions {
  document?: SketchDocument;
  id?: string;
  name?: string;
  thumbnailPng?: Uint8Array;
  tiltOptions?: TiltFileWriteOptions;
}

export interface ImportTiltOptions {
  id?: string;
  name?: string;
  thumbnailPng?: Uint8Array;
  tiltBytes: Uint8Array;
}

export interface ExportTiltOptions {
  document?: SketchDocument;
  tiltOptions?: TiltFileWriteOptions;
}

export interface ExportTiltResult {
  bytes: Uint8Array;
  snapshot: SketchPersistenceSnapshot;
}

export class SketchPersistenceController {
  private activeDocument: SketchDocument;
  private activeRecord: SketchCatalogRecord | undefined;
  private readonly defaultName: string;
  private readonly idFactory: () => string;
  private readonly nowMs: () => number;
  private state: SketchPersistenceSnapshot;

  constructor(
    private readonly store: SketchCatalogStore,
    options: SketchPersistenceControllerOptions = {},
  ) {
    this.defaultName = options.defaultName ?? "Untitled Sketch";
    this.idFactory = options.idFactory ?? createDefaultSketchId;
    this.nowMs = options.nowMs ?? Date.now;
    this.activeDocument = cloneSketchDocument(
      options.initialDocument ??
        createSketchDocument({ metadata: { source: "runtime" } }),
    );
    this.state = {
      activeSketchId: "",
      activeSketchName: this.defaultName,
      status: "idle",
      error: "",
      catalogEntryCount: 0,
      saveRevision: 0,
      loadRevision: 0,
      exportRevision: 0,
      lastSavedAtMs: 0,
      lastLoadedAtMs: 0,
      lastExportedAtMs: 0,
      lastTiltByteLength: 0,
      lastThumbnailByteLength: 0,
      lastSummary: summarizeSketchDocument(this.activeDocument),
      isDirty: false,
    };
  }

  get snapshot(): SketchPersistenceSnapshot {
    return cloneSnapshot(this.state);
  }

  get document(): SketchDocument {
    return cloneSketchDocument(this.activeDocument);
  }

  async list(query = ""): Promise<SketchCatalogListItem[]> {
    const items = await this.store.list();
    this.state = { ...this.state, catalogEntryCount: items.length };
    return query ? searchSketchCatalogItems(items, query) : items;
  }

  markDirty(document: SketchDocument = this.activeDocument): SketchPersistenceSnapshot {
    this.activeDocument = cloneSketchDocument(document);
    this.state = {
      ...this.state,
      error: "",
      isDirty: true,
      lastSummary: summarizeSketchDocument(this.activeDocument),
    };
    return this.snapshot;
  }

  async save(options: SaveSketchOptions = {}): Promise<SketchPersistenceSnapshot> {
    return this.saveWithMode(options, true);
  }

  async saveAs(
    options: SaveSketchOptions = {},
  ): Promise<SketchPersistenceSnapshot> {
    return this.saveWithMode(
      { ...options, id: options.id ?? this.idFactory() },
      false,
    );
  }

  async importTilt(
    options: ImportTiltOptions,
  ): Promise<SketchPersistenceSnapshot> {
    const nowMs = this.nowMs();
    const id = options.id ?? this.idFactory();
    const name = options.name ?? this.defaultName;
    try {
      const record = createSketchCatalogRecordFromTiltBytes({
        id,
        name,
        tiltBytes: options.tiltBytes,
        nowMs,
        thumbnailPng: options.thumbnailPng,
      });
      await this.store.save(record);
      const items = await this.store.list();
      const document = readSketchCatalogRecordDocument(record);
      this.applyRecordState("imported", record, document, items.length, {
        loadRevision: this.state.loadRevision + 1,
        lastLoadedAtMs: nowMs,
      });
      return this.snapshot;
    } catch (error) {
      this.markError(error);
      throw error;
    }
  }

  async load(id: string): Promise<SketchPersistenceSnapshot | undefined> {
    const nowMs = this.nowMs();
    try {
      const record = await this.store.load(id);
      if (!record) {
        this.markError(new Error(`Sketch catalog entry not found: ${id}`));
        return undefined;
      }
      const items = await this.store.list();
      const document = readSketchCatalogRecordDocument(record);
      this.applyRecordState("loaded", record, document, items.length, {
        loadRevision: this.state.loadRevision + 1,
        lastLoadedAtMs: nowMs,
      });
      return this.snapshot;
    } catch (error) {
      this.markError(error);
      throw error;
    }
  }

  async exportTilt(
    options: ExportTiltOptions = {},
  ): Promise<ExportTiltResult> {
    const nowMs = this.nowMs();
    const document = cloneSketchDocument(options.document ?? this.activeDocument);
    try {
      const bytes = writeTiltFile(document, options.tiltOptions);
      this.state = {
        ...this.state,
        status: "exported",
        error: "",
        exportRevision: this.state.exportRevision + 1,
        lastExportedAtMs: nowMs,
        lastTiltByteLength: bytes.byteLength,
        lastSummary: summarizeSketchDocument(document),
      };
      return { bytes, snapshot: this.snapshot };
    } catch (error) {
      this.markError(error);
      throw error;
    }
  }

  async rename(id: string, name: string): Promise<boolean> {
    const nowMs = this.nowMs();
    const renamed = await this.store.rename(id, name, nowMs);
    if (!renamed) {
      this.markError(new Error(`Sketch catalog entry not found: ${id}`));
      return false;
    }
    const items = await this.store.list();
    if (this.activeRecord?.id === id) {
      this.activeRecord = { ...this.activeRecord, name, updatedAtMs: nowMs };
      this.state = {
        ...this.state,
        activeSketchName: name,
      };
    }
    this.state = {
      ...this.state,
      status: "renamed",
      error: "",
      catalogEntryCount: items.length,
    };
    return true;
  }

  async duplicate(
    id: string,
    newId: string,
    newName: string,
  ): Promise<SketchPersistenceSnapshot | undefined> {
    const nowMs = this.nowMs();
    const record = await this.store.duplicate(id, newId, newName, nowMs);
    if (!record) {
      this.markError(new Error(`Sketch catalog entry not found: ${id}`));
      return undefined;
    }
    const items = await this.store.list();
    const document = readSketchCatalogRecordDocument(record);
    this.applyRecordState("duplicated", record, document, items.length, {
      saveRevision: this.state.saveRevision + 1,
      lastSavedAtMs: nowMs,
    });
    return this.snapshot;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.store.delete(id);
    if (!deleted) {
      this.markError(new Error(`Sketch catalog entry not found: ${id}`));
      return false;
    }
    const items = await this.store.list();
    if (this.activeRecord?.id === id) {
      this.activeRecord = undefined;
      this.activeDocument = createSketchDocument({
        metadata: { source: "runtime" },
      });
      this.state = {
        ...this.state,
        activeSketchId: "",
        activeSketchName: this.defaultName,
        lastSummary: summarizeSketchDocument(this.activeDocument),
        isDirty: false,
      };
    }
    this.state = {
      ...this.state,
      status: "deleted",
      error: "",
      catalogEntryCount: items.length,
    };
    return true;
  }

  private async saveWithMode(
    options: SaveSketchOptions,
    reuseActiveRecord: boolean,
  ): Promise<SketchPersistenceSnapshot> {
    const nowMs = this.nowMs();
    const activeRecord = reuseActiveRecord ? this.activeRecord : undefined;
    const document = cloneSketchDocument(options.document ?? this.activeDocument);
    const id = options.id ?? activeRecord?.id ?? this.idFactory();
    const name = options.name ?? activeRecord?.name ?? this.defaultName;
    try {
      const createdRecord = createSketchCatalogRecord({
        id,
        name,
        document,
        nowMs,
        thumbnailPng: options.thumbnailPng,
        tiltOptions: options.tiltOptions,
      });
      const record = {
        ...createdRecord,
        createdAtMs: activeRecord?.createdAtMs ?? createdRecord.createdAtMs,
      };
      await this.store.save(record);
      const items = await this.store.list();
      this.applyRecordState("saved", record, document, items.length, {
        saveRevision: this.state.saveRevision + 1,
        lastSavedAtMs: nowMs,
      });
      return this.snapshot;
    } catch (error) {
      this.markError(error);
      throw error;
    }
  }

  private applyRecordState(
    status: SketchPersistenceStatus,
    record: SketchCatalogRecord,
    document: SketchDocument,
    catalogEntryCount: number,
    updates: Partial<SketchPersistenceSnapshot>,
  ): void {
    this.activeRecord = cloneRecord(record);
    this.activeDocument = cloneSketchDocument(document);
    this.state = {
      ...this.state,
      ...updates,
      activeSketchId: record.id,
      activeSketchName: record.name,
      status,
      error: "",
      catalogEntryCount,
      lastTiltByteLength: record.tiltBytes.byteLength,
      lastThumbnailByteLength: record.thumbnailPng.byteLength,
      lastSummary: { ...record.summary },
      isDirty: false,
    };
  }

  private markError(error: unknown): void {
    this.state = {
      ...this.state,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createDefaultSketchId(): string {
  return `sketch-${Date.now().toString(36)}`;
}

function cloneSnapshot(
  snapshot: SketchPersistenceSnapshot,
): SketchPersistenceSnapshot {
  return {
    ...snapshot,
    lastSummary: { ...snapshot.lastSummary },
  };
}

function cloneRecord(record: SketchCatalogRecord): SketchCatalogRecord {
  return {
    ...record,
    summary: { ...record.summary },
    tiltBytes: new Uint8Array(record.tiltBytes),
    thumbnailPng: new Uint8Array(record.thumbnailPng),
  };
}

function cloneSketchDocument(document: SketchDocument): SketchDocument {
  return {
    metadata: { ...document.metadata },
    layers: document.layers.map(cloneSketchLayer),
    media: document.media.map(cloneSketchMediaReference),
    strokes: document.strokes.map(cloneStrokeData),
  };
}

function cloneSketchLayer(layer: SketchLayer): SketchLayer {
  return { ...layer };
}

function cloneSketchMediaReference(
  media: SketchMediaReference,
): SketchMediaReference {
  return {
    ...media,
    transform: {
      position: [...media.transform.position] as Vec3,
      rotation: [...media.transform.rotation] as Quat,
      scale: [...media.transform.scale] as Vec3,
    },
  };
}

function cloneStrokeData(stroke: StrokeData): StrokeData {
  return {
    ...stroke,
    color: [...stroke.color] as Rgba,
    controlPoints: stroke.controlPoints.map(cloneControlPoint),
  };
}

function cloneControlPoint(controlPoint: ControlPoint): ControlPoint {
  return {
    position: [...controlPoint.position] as Vec3,
    orientation: [...controlPoint.orientation] as Quat,
    pressure: controlPoint.pressure,
    timestampMs: controlPoint.timestampMs,
  };
}

import {
  summarizeSketchDocument,
  type SketchDocument,
  type SketchDocumentSummary,
} from "./document.js";
import {
  readTiltFile,
  writeTiltFile,
  type TiltFileWriteOptions,
} from "./tilt-file.js";

export interface SketchCatalogRecord {
  id: string;
  name: string;
  createdAtMs: number;
  updatedAtMs: number;
  summary: SketchDocumentSummary;
  tiltBytes: Uint8Array;
  thumbnailPng: Uint8Array;
}

export type SketchCatalogListItem = Omit<
  SketchCatalogRecord,
  "tiltBytes" | "thumbnailPng"
>;

export interface SketchCatalogStore {
  save(record: SketchCatalogRecord): Promise<void>;
  load(id: string): Promise<SketchCatalogRecord | undefined>;
  list(): Promise<SketchCatalogListItem[]>;
  delete(id: string): Promise<boolean>;
  rename(id: string, name: string, nowMs: number): Promise<boolean>;
  duplicate(
    id: string,
    newId: string,
    newName: string,
    nowMs: number,
  ): Promise<SketchCatalogRecord | undefined>;
}

export function createSketchCatalogRecord({
  id,
  name,
  document,
  nowMs,
  thumbnailPng = DEFAULT_CATALOG_THUMBNAIL_PNG,
  tiltOptions,
}: {
  id: string;
  name: string;
  document: SketchDocument;
  nowMs: number;
  thumbnailPng?: Uint8Array;
  tiltOptions?: TiltFileWriteOptions;
}): SketchCatalogRecord {
  return {
    id,
    name,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    summary: summarizeSketchDocument(document),
    tiltBytes: writeTiltFile(document, {
      ...tiltOptions,
      thumbnailPng,
    }),
    thumbnailPng: cloneBytes(thumbnailPng),
  };
}

export function readSketchCatalogRecordDocument(
  record: SketchCatalogRecord,
): SketchDocument {
  return readTiltFile(record.tiltBytes);
}

export class MemorySketchCatalogStore implements SketchCatalogStore {
  private readonly records = new Map<string, SketchCatalogRecord>();

  async save(record: SketchCatalogRecord): Promise<void> {
    this.records.set(record.id, cloneRecord(record));
  }

  async load(id: string): Promise<SketchCatalogRecord | undefined> {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  async list(): Promise<SketchCatalogListItem[]> {
    return Array.from(this.records.values())
      .map(toListItem)
      .sort(compareListItems);
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  async rename(id: string, name: string, nowMs: number): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) {
      return false;
    }
    this.records.set(id, {
      ...cloneRecord(record),
      name,
      updatedAtMs: nowMs,
    });
    return true;
  }

  async duplicate(
    id: string,
    newId: string,
    newName: string,
    nowMs: number,
  ): Promise<SketchCatalogRecord | undefined> {
    const record = this.records.get(id);
    if (!record) {
      return undefined;
    }
    const duplicate = {
      ...cloneRecord(record),
      id: newId,
      name: newName,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    this.records.set(newId, cloneRecord(duplicate));
    return cloneRecord(duplicate);
  }
}

export class IndexedDbSketchCatalogStore implements SketchCatalogStore {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(
    private readonly dbName = "openbrush-iwsdk-catalog",
    private readonly storeName = "sketches",
  ) {}

  async save(record: SketchCatalogRecord): Promise<void> {
    await this.withStore("readwrite", (store) => {
      store.put(cloneRecord(record));
    });
  }

  async load(id: string): Promise<SketchCatalogRecord | undefined> {
    const record = await this.withStore("readonly", (store) =>
      requestToPromise<SketchCatalogRecord | undefined>(store.get(id)),
    );
    return record ? cloneRecord(record) : undefined;
  }

  async list(): Promise<SketchCatalogListItem[]> {
    const records = await this.withStore("readonly", (store) =>
      requestToPromise<SketchCatalogRecord[]>(store.getAll()),
    );
    return records.map(toListItem).sort(compareListItems);
  }

  async delete(id: string): Promise<boolean> {
    const existed = (await this.load(id)) !== undefined;
    if (!existed) {
      return false;
    }
    await this.withStore("readwrite", (store) => {
      store.delete(id);
    });
    return true;
  }

  async rename(id: string, name: string, nowMs: number): Promise<boolean> {
    const record = await this.load(id);
    if (!record) {
      return false;
    }
    await this.save({ ...record, name, updatedAtMs: nowMs });
    return true;
  }

  async duplicate(
    id: string,
    newId: string,
    newName: string,
    nowMs: number,
  ): Promise<SketchCatalogRecord | undefined> {
    const record = await this.load(id);
    if (!record) {
      return undefined;
    }
    const duplicate = {
      ...record,
      id: newId,
      name: newName,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    await this.save(duplicate);
    return cloneRecord(duplicate);
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => T | Promise<T>,
  ): Promise<T> {
    const db = await this.getDb();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);
      let callbackResult: T | Promise<T>;
      transaction.oncomplete = () => {
        Promise.resolve(callbackResult).then(resolve, reject);
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      };
      try {
        callbackResult = callback(store);
      } catch (error) {
        reject(error);
      }
    });
  }

  private getDb(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        reject(request.error ?? new Error("Unable to open sketch catalog"));
      };
    });
    return this.dbPromise;
  }
}

function toListItem(record: SketchCatalogRecord): SketchCatalogListItem {
  return {
    id: record.id,
    name: record.name,
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    summary: { ...record.summary },
  };
}

function compareListItems(
  left: SketchCatalogListItem,
  right: SketchCatalogListItem,
): number {
  return right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name);
}

function cloneRecord(record: SketchCatalogRecord): SketchCatalogRecord {
  return {
    ...record,
    summary: { ...record.summary },
    tiltBytes: cloneBytes(record.tiltBytes),
    thumbnailPng: cloneBytes(record.thumbnailPng),
  };
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}

const DEFAULT_CATALOG_THUMBNAIL_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
  120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 42, 180, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130,
]);

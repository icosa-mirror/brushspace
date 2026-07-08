/**
 * Tracks the downloads the landing scene needs before it is presentable
 * (intro sketch geometry and materials, environment, wordmark) and exposes a
 * single 0..1 progress value for the HTML loading screen. Assets keep
 * loading through their existing runtime paths — this is bookkeeping, not a
 * loader; every reporting site completes its task in a `finally` so a failed
 * download degrades to the old pop-in behavior instead of wedging the
 * overlay.
 */

export interface InitialLoadTaskSpec {
  id: string;
  weight: number;
}

type InitialLoadListener = (progress: number) => void;

export class InitialLoadTracker {
  private readonly weights = new Map<string, number>();
  private readonly fractions = new Map<string, number>();
  private readonly listeners = new Set<InitialLoadListener>();
  private resolveDone!: () => void;
  private resolved = false;

  /** Resolves once every task reaches completion. */
  readonly whenDone: Promise<void>;

  constructor(tasks: readonly InitialLoadTaskSpec[]) {
    for (const task of tasks) {
      this.weights.set(task.id, task.weight);
      this.fractions.set(task.id, 0);
    }
    this.whenDone = new Promise((resolve) => {
      this.resolveDone = resolve;
    });
  }

  /** Overall weighted progress in [0, 1]. */
  get progress(): number {
    let total = 0;
    let done = 0;
    for (const [id, weight] of this.weights) {
      total += weight;
      done += weight * (this.fractions.get(id) ?? 0);
    }
    return total > 0 ? done / total : 1;
  }

  get done(): boolean {
    for (const fraction of this.fractions.values()) {
      if (fraction < 1) {
        return false;
      }
    }
    return true;
  }

  /** Reports partial progress for a task; clamped to [0, 1] and monotonic. */
  setProgress(id: string, fraction: number): void {
    const current = this.fractions.get(id);
    if (current === undefined) {
      return;
    }
    const next = Math.min(Math.max(fraction, current), 1);
    if (next === current) {
      return;
    }
    this.fractions.set(id, next);
    this.emit();
  }

  /** Marks a task finished (call from failure paths too). */
  complete(id: string): void {
    this.setProgress(id, 1);
  }

  /** Subscribes to progress changes; invoked immediately with the current value. */
  subscribe(listener: InitialLoadListener): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const progress = this.progress;
    for (const listener of this.listeners) {
      listener(progress);
    }
    if (!this.resolved && this.done) {
      this.resolved = true;
      this.resolveDone();
    }
  }
}

/**
 * Fetches a binary asset, reporting download progress against the
 * Content-Length header. Progress stays at 0 when the header is absent;
 * with compressed transfer encodings the header counts compressed bytes
 * while the reader yields decompressed ones, so the fraction is clamped.
 */
export async function fetchArrayBufferWithProgress(
  url: string,
  onProgress: (fraction: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("Content-Length") ?? 0);
  if (!response.body || !(total > 0)) {
    return response.arrayBuffer();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.byteLength;
    onProgress(Math.min(received / total, 1));
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}

/**
 * The landing-critical downloads, weighted by approximate payload size so
 * the bar roughly tracks bytes: intro geometry ~7.7 MB, intro brush
 * textures + shaders ~5 MB, wordmark ~1.1 MB, environment ~0.3 MB, engine
 * init nominal.
 */
export const initialLoad = new InitialLoadTracker([
  { id: "world", weight: 1 },
  { id: "environment", weight: 1 },
  { id: "intro-geometry", weight: 8 },
  { id: "intro-materials", weight: 5 },
  { id: "intro-wordmark", weight: 1 },
]);

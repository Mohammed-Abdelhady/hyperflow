/**
 * Integrity heuristic: size/mtime stability + checksum no-op suppression.
 * Classifies settled paths as changed / deleted / unstable / no-op.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, existsSync } from "node:fs";

/** Short interval between stability probes (ms). */
export const INTEGRITY_STABILITY_MS = 25;

export type IntegrityKind = "created" | "changed" | "deleted";

export type IntegrityEntry = {
  path: string;
  kind: IntegrityKind;
  checksum?: string;
  size?: number;
  mtimeMs?: number;
};

export type IntegrityResult = {
  emit: IntegrityEntry[];
  /** Paths still growing / mid-write — caller should re-queue to settle. */
  defer: string[];
};

export type IntegrityClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type IntegrityFs = {
  exists: (path: string) => boolean;
  stat: (path: string) => { size: number; mtimeMs: number };
  read: (path: string) => Buffer;
};

const defaultFs: IntegrityFs = {
  exists: (p) => existsSync(p),
  stat: (p) => {
    const s = statSync(p);
    return { size: s.size, mtimeMs: s.mtimeMs };
  },
  read: (p) => readFileSync(p),
};

const defaultClock: IntegrityClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export function checksumBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type IntegrityChecker = {
  /** Process a settled path set; updates internal checksum cache. */
  check: (paths: readonly string[]) => Promise<IntegrityResult>;
  /** Current checksum cache size (tests). */
  cacheSize: () => number;
  /** Seed or clear cache entries. */
  seed: (path: string, checksum: string) => void;
  clear: (path?: string) => void;
};

export type IntegrityOptions = {
  fs?: IntegrityFs | undefined;
  clock?: IntegrityClock | undefined;
  stabilityMs?: number | undefined;
};

export function createIntegrityChecker(
  options: IntegrityOptions = {},
): IntegrityChecker {
  const fs = options.fs ?? defaultFs;
  const clock = options.clock ?? defaultClock;
  const stabilityMs = options.stabilityMs ?? INTEGRITY_STABILITY_MS;
  const cache = new Map<string, string>();

  async function checkOne(path: string): Promise<{
    entry?: IntegrityEntry;
    defer?: string;
  }> {
    if (!fs.exists(path)) {
      const had = cache.has(path);
      cache.delete(path);
      if (had) {
        return { entry: { path, kind: "deleted" } };
      }
      // Never-seen path deleted — ignore
      return {};
    }

    let first: { size: number; mtimeMs: number };
    try {
      first = fs.stat(path);
    } catch {
      return { defer: path };
    }

    if (stabilityMs > 0) {
      await clock.sleep(stabilityMs);
    }

    let second: { size: number; mtimeMs: number };
    try {
      second = fs.stat(path);
    } catch {
      return { defer: path };
    }

    if (first.size !== second.size || first.mtimeMs !== second.mtimeMs) {
      return { defer: path };
    }

    let buf: Buffer;
    try {
      buf = fs.read(path);
    } catch {
      return { defer: path };
    }

    // Final size check after read (torn write mid-read).
    try {
      const third = fs.stat(path);
      if (third.size !== second.size) return { defer: path };
    } catch {
      return { defer: path };
    }

    const sum = checksumBuffer(buf);
    const prev = cache.get(path);
    if (prev === sum) {
      // no-op (same content; mtime-only touch suppressed)
      return {};
    }

    const kind: IntegrityKind = prev === undefined ? "created" : "changed";
    cache.set(path, sum);
    return {
      entry: {
        path,
        kind,
        checksum: sum,
        size: second.size,
        mtimeMs: second.mtimeMs,
      },
    };
  }

  async function check(paths: readonly string[]): Promise<IntegrityResult> {
    const emit: IntegrityEntry[] = [];
    const defer: string[] = [];
    for (const path of paths) {
      const r = await checkOne(path);
      if (r.entry) emit.push(r.entry);
      if (r.defer) defer.push(r.defer);
    }
    return { emit, defer };
  }

  return {
    check,
    cacheSize: () => cache.size,
    seed: (path, checksum) => {
      cache.set(path, checksum);
    },
    clear: (path) => {
      if (path === undefined) cache.clear();
      else cache.delete(path);
    },
  };
}

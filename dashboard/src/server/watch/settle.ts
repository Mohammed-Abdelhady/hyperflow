/**
 * Debounce / settle window with per-path burst coalescing.
 * Injectable clock for deterministic tests (spec §4.3).
 */

/** Per-path quiet period before a path is considered settled. */
export const SETTLE_DEBOUNCE_MS = 150;

/** Global coalescing tick — batches all settled paths into one changeset. */
export const SETTLE_COALESCE_MS = 50;

export type SettleClock = {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type SettledChangeset = {
  paths: readonly string[];
  settledAt: number;
};

export type SettleOptions = {
  debounceMs?: number | undefined;
  coalesceMs?: number | undefined;
  clock?: SettleClock | undefined;
  onSettled: (changeset: SettledChangeset) => void;
};

const systemClock: SettleClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/**
 * Per-path debounce + global coalesce. A still-hot path keeps deferring
 * until quiet for debounceMs; multiple paths flush as one changeset.
 */
export function createSettler(options: SettleOptions): {
  note: (path: string) => void;
  dispose: () => void;
  pendingCount: () => number;
} {
  const debounceMs = options.debounceMs ?? SETTLE_DEBOUNCE_MS;
  const coalesceMs = options.coalesceMs ?? SETTLE_COALESCE_MS;
  const clock = options.clock ?? systemClock;

  const pathTimers = new Map<string, unknown>();
  const ready = new Set<string>();
  let coalesceTimer: unknown = null;

  function flushReady(): void {
    coalesceTimer = null;
    if (ready.size === 0) return;
    const paths = [...ready].sort();
    ready.clear();
    options.onSettled({ paths, settledAt: clock.now() });
  }

  function scheduleCoalesce(): void {
    if (coalesceTimer !== null) return;
    coalesceTimer = clock.setTimeout(flushReady, coalesceMs);
  }

  function markReady(path: string): void {
    pathTimers.delete(path);
    ready.add(path);
    scheduleCoalesce();
  }

  function note(path: string): void {
    const existing = pathTimers.get(path);
    if (existing !== undefined) {
      clock.clearTimeout(existing);
    }
    // Path became hot again — remove from ready set if it was waiting coalesce.
    ready.delete(path);
    const handle = clock.setTimeout(() => markReady(path), debounceMs);
    pathTimers.set(path, handle);
  }

  function dispose(): void {
    for (const h of pathTimers.values()) clock.clearTimeout(h);
    pathTimers.clear();
    ready.clear();
    if (coalesceTimer !== null) {
      clock.clearTimeout(coalesceTimer);
      coalesceTimer = null;
    }
  }

  return {
    note,
    dispose,
    pendingCount: () => pathTimers.size + ready.size,
  };
}

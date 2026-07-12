/**
 * Pure stream ingestion discipline — unit-tested without DOM.
 *
 * Coalesce window: 100 ms
 * Stagger cap: 3 × 25 ms (tagged on batch; consumer applies)
 * Circuit breaker: sustained >5 rows/s on coalesced append rate
 */

export const COALESCE_WINDOW_MS = 100;
export const STAGGER_CAP = 3;
export const STAGGER_STEP_MS = 25;
export const BREAKER_ROWS_PER_SEC = 5;
export const RATE_WINDOW_MS = 1000;

export interface StreamEventLike {
  id: string;
}

export type AppendMode = "animate" | "snap";

export interface CoalesceBatch<T extends StreamEventLike> {
  items: T[];
  /** How many of the leading items may stagger-enter. */
  staggerCount: number;
  mode: AppendMode;
  at: number;
}

export interface CoalesceState<T extends StreamEventLike> {
  buffer: T[];
  /** Timestamps of coalesced batch flushes (for rate). */
  flushTimes: number[];
  lastFlushAt: number | null;
  snapMode: boolean;
}

export function createCoalesceState<T extends StreamEventLike>(): CoalesceState<T> {
  return {
    buffer: [],
    flushTimes: [],
    lastFlushAt: null,
    snapMode: false,
  };
}

function pruneFlushTimes(times: number[], now: number): number[] {
  return times.filter((t) => now - t <= RATE_WINDOW_MS);
}

function ratePerSec(times: number[], now: number): number {
  const recent = pruneFlushTimes(times, now);
  if (recent.length === 0) return 0;
  // Count of appends in the last second.
  return recent.length;
}

/**
 * Push one or more events. Returns batches ready to flush when the coalesce
 * window closes relative to `now` and prior buffer.
 *
 * Call with `flush=true` to force emit the buffer (timer tick / unmount).
 */
export function pushEvents<T extends StreamEventLike>(
  state: CoalesceState<T>,
  incoming: readonly T[],
  now: number,
  flush = false,
): { state: CoalesceState<T>; batches: CoalesceBatch<T>[] } {
  const buffer = [...state.buffer, ...incoming];
  const batches: CoalesceBatch<T>[] = [];
  let flushTimes = pruneFlushTimes(state.flushTimes, now);
  let snapMode = state.snapMode;
  let lastFlushAt = state.lastFlushAt;

  const windowOpen =
    lastFlushAt === null || now - lastFlushAt >= COALESCE_WINDOW_MS;

  if ((flush || windowOpen) && buffer.length > 0) {
    const rate = ratePerSec(flushTimes, now);
    // Breaker trips when rate of prior flushes already at threshold and this
    // flush would sustain above 5 rows/s. Exactly 5 does not trip.
    if (rate > BREAKER_ROWS_PER_SEC) {
      snapMode = true;
    } else if (rate < BREAKER_ROWS_PER_SEC) {
      snapMode = false;
    }

    // Rate is measured on coalesced batches (1 flush = 1 append), not raw rows.
    // Also consider rows in this batch for breaker entry when bursty.
    const projectedRate = rate + 1;
    const mode: AppendMode =
      snapMode || projectedRate > BREAKER_ROWS_PER_SEC ? "snap" : "animate";
    if (mode === "snap") snapMode = true;

    batches.push({
      items: buffer,
      staggerCount: mode === "animate" ? Math.min(STAGGER_CAP, buffer.length) : 0,
      mode,
      at: now,
    });
    flushTimes = [...flushTimes, now];
    lastFlushAt = now;
    return {
      state: {
        buffer: [],
        flushTimes,
        lastFlushAt,
        snapMode,
      },
      batches,
    };
  }

  return {
    state: {
      buffer,
      flushTimes,
      lastFlushAt,
      snapMode,
    },
    batches,
  };
}

/**
 * Scripted burst helper for tests: feed timestamped arrivals, return batches.
 */
export function runCoalesceScript<T extends StreamEventLike>(
  arrivals: readonly { at: number; events: readonly T[] }[],
): CoalesceBatch<T>[] {
  let state = createCoalesceState<T>();
  const all: CoalesceBatch<T>[] = [];
  for (const step of arrivals) {
    // Auto-flush previous buffer if window elapsed before this arrival.
    if (state.buffer.length > 0 && state.lastFlushAt !== null) {
      if (step.at - state.lastFlushAt >= COALESCE_WINDOW_MS) {
        const forced = pushEvents(state, [], step.at, true);
        state = forced.state;
        all.push(...forced.batches);
      }
    } else if (state.buffer.length > 0 && state.lastFlushAt === null) {
      // First buffer waiting — flush if first event is old enough.
      const forced = pushEvents(state, [], step.at, true);
      state = forced.state;
      all.push(...forced.batches);
    }
    const result = pushEvents(state, step.events, step.at, false);
    state = result.state;
    all.push(...result.batches);
  }
  if (state.buffer.length > 0) {
    const end = (arrivals[arrivals.length - 1]?.at ?? 0) + COALESCE_WINDOW_MS;
    const final = pushEvents(state, [], end, true);
    all.push(...final.batches);
  }
  return all;
}

/**
 * Bounded FIFO of recent published SSE events for Last-Event-ID replay.
 * Generic over entry shape — no SSE framing knowledge.
 */

/** Default capacity for the hub ring buffer (hard replay horizon). */
export const DEFAULT_RING_CAPACITY = 256;

export type RingEntry<T> = {
  seq: number;
  payload: T;
};

export type AfterResult<T> =
  | { ok: true; entries: readonly RingEntry<T>[] }
  | { ok: false; reason: "out-of-window" | "empty" };

export type RingBuffer<T> = {
  readonly capacity: number;
  append: (seq: number, payload: T) => void;
  /** Entries with seq strictly greater than `seq`, in order. */
  after: (seq: number) => AfterResult<T>;
  /** Lowest seq currently retained, or null if empty. */
  minSeq: () => number | null;
  /** Highest seq currently retained, or null if empty. */
  maxSeq: () => number | null;
  size: () => number;
  clear: () => void;
};

export function createRingBuffer<T>(
  capacity: number = DEFAULT_RING_CAPACITY,
): RingBuffer<T> {
  if (capacity < 1) {
    throw new Error("ring-capacity-min-1");
  }
  const buf: RingEntry<T>[] = [];

  function append(seq: number, payload: T): void {
    buf.push({ seq, payload });
    while (buf.length > capacity) {
      buf.shift();
    }
  }

  function after(seq: number): AfterResult<T> {
    if (buf.length === 0) {
      return { ok: false, reason: "empty" };
    }
    const min = buf[0]!.seq;
    const max = buf[buf.length - 1]!.seq;

    // Client is fully caught up (or ahead): empty range, still in window.
    if (seq >= max) {
      return { ok: true, entries: [] };
    }

    // Requested cursor is older than anything retained.
    if (seq < min - 1) {
      // seq+1 is not in buffer → out of window.
      // Exception: if seq is just before min (seq === min-1), we can replay all.
      return { ok: false, reason: "out-of-window" };
    }

    // seq === min-1 → return everything; seq >= min → return > seq
    const entries = buf.filter((e) => e.seq > seq);
    // If filter is empty but seq < max we already handled; if seq was in window
    // but entry missing (gaps shouldn't happen) treat as in-window empty.
    if (entries.length === 0 && seq < min) {
      return { ok: false, reason: "out-of-window" };
    }
    return { ok: true, entries };
  }

  return {
    capacity,
    append,
    after,
    minSeq: () => (buf.length === 0 ? null : buf[0]!.seq),
    maxSeq: () => (buf.length === 0 ? null : buf[buf.length - 1]!.seq),
    size: () => buf.length,
    clear: () => {
      buf.length = 0;
    },
  };
}

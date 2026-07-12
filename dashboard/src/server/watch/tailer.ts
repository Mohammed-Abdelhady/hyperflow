/**
 * Byte-offset NDJSON tailer: partial-line hold + shrink resync.
 * Emits raw line strings only — no schema knowledge.
 */
import { openSync, readSync, closeSync, fstatSync, existsSync } from "node:fs";

export type TailerSignal =
  | { kind: "line"; line: string; offset: number }
  | { kind: "resync"; reason: "shrink" | "missing-then-present" | "manual" };

export type TailerConsumer = (signal: TailerSignal) => void;

export type NdjsonTailer = {
  poll: () => void;
  /** Absolute end offset of the last fully consumed line. */
  offset: () => number;
  reset: (offset?: number) => void;
  dispose: () => void;
};

export type NdjsonTailerOptions = {
  path: string;
  onSignal: TailerConsumer;
  initialOffset?: number | undefined;
};

function readRange(
  path: string,
  from: number,
): { bytes: Buffer; size: number } | null {
  if (!existsSync(path)) return null;
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    if (size <= from) return { bytes: Buffer.alloc(0), size };
    const len = size - from;
    const buf = Buffer.alloc(len);
    const n = readSync(fd, buf, 0, len, from);
    return { bytes: buf.subarray(0, n), size };
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Stateful byte-offset tailer over one NDJSON file.
 * Reads only new bytes past `readPos`; holds incomplete trailing line in `carry`.
 * File size < readPos → resync from zero.
 */
export function createNdjsonTailer(options: NdjsonTailerOptions): NdjsonTailer {
  const { path, onSignal } = options;
  /** Next absolute byte index to read from disk. */
  let readPos = options.initialOffset ?? 0;
  /** Incomplete trailing line bytes (no newline yet). */
  let carry: Buffer = Buffer.alloc(0);
  /** End offset of last fully emitted line. */
  let committedPos = options.initialOffset ?? 0;
  let seenMissing = !existsSync(path);
  let disposed = false;

  function processBuffer(data: Buffer, bufferAbsStart: number): void {
    let start = 0;
    for (let i = 0; i < data.length; i += 1) {
      if (data[i] !== 0x0a) continue;
      let end = i;
      if (end > start && data[end - 1] === 0x0d) end -= 1;
      const line = data.subarray(start, end).toString("utf8");
      const lineEndAbs = bufferAbsStart + i + 1;
      onSignal({ kind: "line", line, offset: lineEndAbs });
      committedPos = lineEndAbs;
      start = i + 1;
    }
    carry =
      start < data.length
        ? Buffer.from(data.subarray(start))
        : Buffer.alloc(0);
  }

  function fullResync(
    reason: "shrink" | "missing-then-present" | "manual",
  ): void {
    readPos = 0;
    committedPos = 0;
    carry = Buffer.alloc(0);
    onSignal({ kind: "resync", reason });
    const full = readRange(path, 0);
    if (!full) return;
    if (full.bytes.length > 0) processBuffer(full.bytes, 0);
    readPos = full.size;
  }

  function poll(): void {
    if (disposed) return;

    if (!existsSync(path)) {
      seenMissing = true;
      return;
    }

    if (seenMissing) {
      seenMissing = false;
      fullResync("missing-then-present");
      return;
    }

    const result = readRange(path, readPos);
    if (result === null) {
      seenMissing = true;
      return;
    }

    if (result.size < readPos) {
      fullResync("shrink");
      return;
    }

    if (result.bytes.length === 0) return;

    const bufferAbsStart = readPos - carry.length;
    const data =
      carry.length > 0 ? Buffer.concat([carry, result.bytes]) : result.bytes;
    processBuffer(data, bufferAbsStart);
    readPos = result.size;
  }

  return {
    poll,
    offset: () => committedPos,
    reset(next = 0) {
      readPos = next;
      committedPos = next;
      carry = Buffer.alloc(0);
    },
    dispose() {
      disposed = true;
      carry = Buffer.alloc(0);
    },
  };
}

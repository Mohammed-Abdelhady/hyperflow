import type { SnapshotDelta } from "@shared/schemas/index.js";
import { parseEpochSeqId } from "@shared/schemas/index.js";

export interface BufferedDelta {
  id: string;
  delta: SnapshotDelta;
}

/**
 * Hydration buffer: hold deltas until hydrate completes, then flush in id order
 * skipping ids at or below the snapshot watermark.
 */
export class HydrationBuffer {
  private items: BufferedDelta[] = [];
  private open = true;

  push(id: string, delta: SnapshotDelta): void {
    if (!this.open) return;
    this.items.push({ id, delta });
  }

  close(): void {
    this.open = false;
  }

  isOpen(): boolean {
    return this.open;
  }

  flush(watermark: string | null): BufferedDelta[] {
    this.open = false;
    const sorted = this.items.slice().sort((a, b) => compareEpochSeq(a.id, b.id));
    this.items = [];
    if (!watermark) return sorted;
    return sorted.filter((item) => compareEpochSeq(item.id, watermark) > 0);
  }

  clear(): void {
    this.items = [];
    this.open = true;
  }
}

export function compareEpochSeq(a: string, b: string): number {
  const pa = parseEpochSeqId(a);
  const pb = parseEpochSeqId(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.epoch !== pb.epoch) return pa.epoch.localeCompare(pb.epoch);
  return pa.seq - pb.seq;
}

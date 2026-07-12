import { describe, expect, it } from "vitest";
import { createRingBuffer } from "../../../src/server/sse/ring-buffer.js";

describe("ring-buffer", () => {
  it("capacity 8, append 12 → after(3) reports out-of-window; after(9) returns 10..12", () => {
    const ring = createRingBuffer<string>(8);
    for (let i = 1; i <= 12; i += 1) {
      ring.append(i, `e${i}`);
    }
    expect(ring.size()).toBe(8);
    expect(ring.minSeq()).toBe(5);
    expect(ring.maxSeq()).toBe(12);

    const early = ring.after(3);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe("out-of-window");

    const late = ring.after(9);
    expect(late.ok).toBe(true);
    if (late.ok) {
      expect(late.entries.map((e) => e.seq)).toEqual([10, 11, 12]);
      expect(late.entries.map((e) => e.payload)).toEqual(["e10", "e11", "e12"]);
    }
  });

  it("after(newest) returns empty in-window range", () => {
    const ring = createRingBuffer<number>(4);
    ring.append(1, 1);
    ring.append(2, 2);
    const r = ring.after(2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entries).toEqual([]);
  });
});

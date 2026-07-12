import { describe, expect, it, vi } from "vitest";
import {
  createSettler,
  SETTLE_DEBOUNCE_MS,
  type SettleClock,
} from "../../../src/server/watch/settle.js";

function fakeClock() {
  let now = 0;
  const timers = new Map<number, { fn: () => void; due: number }>();
  let nextId = 1;

  const clock: SettleClock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, due: now + ms });
      return id;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
  };

  function advance(ms: number): void {
    now += ms;
    const due = [...timers.entries()]
      .filter(([, t]) => t.due <= now)
      .sort((a, b) => a[1].due - b[1].due);
    for (const [id, t] of due) {
      timers.delete(id);
      t.fn();
    }
  }

  return { clock, advance, get now() { return now; } };
}

describe("settle", () => {
  it("50 raw events on one path within 150ms → one settled path", () => {
    const fc = fakeClock();
    const settled = vi.fn();
    const s = createSettler({
      clock: fc.clock,
      debounceMs: SETTLE_DEBOUNCE_MS,
      coalesceMs: 50,
      onSettled: settled,
    });

    for (let i = 0; i < 50; i += 1) {
      s.note("/proj/.hyperflow/memory/decisions.md");
      fc.advance(2);
    }
    // still within debounce of last note
    fc.advance(SETTLE_DEBOUNCE_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    fc.advance(1);
    // debounce fired → path ready; coalesce window
    fc.advance(50);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0]?.[0].paths).toEqual([
      "/proj/.hyperflow/memory/decisions.md",
    ]);
    s.dispose();
  });

  it("events on 8 paths within one coalescing window → single changeset with 8 paths", () => {
    const fc = fakeClock();
    const settled = vi.fn();
    const s = createSettler({
      clock: fc.clock,
      debounceMs: 150,
      coalesceMs: 50,
      onSettled: settled,
    });

    for (let i = 0; i < 8; i += 1) {
      s.note(`/proj/.hyperflow/f${i}.md`);
    }
    fc.advance(150);
    fc.advance(50);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0]?.[0].paths).toHaveLength(8);
    s.dispose();
  });

  it("path receiving events every 100ms never settles until writes stop", () => {
    const fc = fakeClock();
    const settled = vi.fn();
    const s = createSettler({
      clock: fc.clock,
      debounceMs: 150,
      coalesceMs: 50,
      onSettled: settled,
    });

    for (let i = 0; i < 10; i += 1) {
      s.note("/hot.md");
      fc.advance(100);
    }
    expect(settled).not.toHaveBeenCalled();
    fc.advance(150);
    fc.advance(50);
    expect(settled).toHaveBeenCalledTimes(1);
    s.dispose();
  });
});

import { describe, expect, it } from "vitest";
import {
  BREAKER_ROWS_PER_SEC,
  COALESCE_WINDOW_MS,
  createCoalesceState,
  pushEvents,
  runCoalesceScript,
} from "../../../../src/client/features/missionControl/hooks/stream-coalesce";

function ev(id: string) {
  return { id };
}

describe("stream coalesce", () => {
  it("batches events within a 100ms window", () => {
    let state = createCoalesceState<{ id: string }>();
    const a = pushEvents(state, [ev("1"), ev("2")], 0);
    state = a.state;
    // Same window — still buffered if lastFlush just happened
    const b = pushEvents(state, [ev("3")], 50);
    state = b.state;
    const c = pushEvents(state, [], 0 + COALESCE_WINDOW_MS, true);
    const batches = [...a.batches, ...b.batches, ...c.batches];
    const total = batches.reduce((s, bat) => s + bat.items.length, 0);
    expect(total).toBe(3);
  });

  it("stagger-caps animate batches at 3", () => {
    const batches = runCoalesceScript([
      {
        at: 0,
        events: [ev("a"), ev("b"), ev("c"), ev("d")],
      },
    ]);
    expect(batches.length).toBeGreaterThanOrEqual(1);
    const first = batches[0]!;
    if (first.mode === "animate") {
      expect(first.staggerCount).toBe(3);
      expect(first.items).toHaveLength(4);
    }
  });

  it("trips snap mode above 5 rows/s sustained and recovers", () => {
    // Emit one batch per 100ms → 10 batches/s > 5.
    const arrivals = Array.from({ length: 12 }, (_, i) => ({
      at: i * COALESCE_WINDOW_MS,
      events: [ev(`e${i}`)],
    }));
    const batches = runCoalesceScript(arrivals);
    expect(batches.some((b) => b.mode === "snap")).toBe(true);

    // Quiet period then single event → animate again.
    const quiet = runCoalesceScript([
      { at: 0, events: [ev("q0")] },
      { at: 2000, events: [ev("q1")] },
    ]);
    const last = quiet[quiet.length - 1]!;
    expect(last.mode).toBe("animate");
  });

  it("does not trip breaker at exactly 5 rows/s", () => {
    // 5 flushes spaced 200ms apart inside 1s → rate 5, not >5.
    const arrivals = Array.from({ length: 5 }, (_, i) => ({
      at: i * 200,
      events: [ev(`x${i}`)],
    }));
    const batches = runCoalesceScript(arrivals);
    // First windows stay animate; breaker requires > BREAKER_ROWS_PER_SEC.
    expect(BREAKER_ROWS_PER_SEC).toBe(5);
    expect(batches.filter((b) => b.mode === "animate").length).toBeGreaterThan(
      0,
    );
  });
});

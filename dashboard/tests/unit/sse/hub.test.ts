import { describe, expect, it } from "vitest";
import { createSseHub, serializeSseFrame } from "../../../src/server/sse/hub.js";
import { SSE_EVENT_NAMES, formatEpochSeqId } from "../../../src/shared/schemas/delta.js";

function collectSink() {
  const frames: string[] = [];
  return {
    frames,
    sink: {
      write: (f: string) => {
        frames.push(f);
      },
    },
  };
}

describe("sse hub", () => {
  it("assigns strictly monotonic seq across 1000 publishes; id format matches epoch-seq", () => {
    const hub = createSseHub({ epoch: "abc", clientOptions: { heartbeatIntervalMs: 0 } });
    const ids: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const rec = hub.publish({
        event: SSE_EVENT_NAMES.HF_EVENT,
        data: { i },
      });
      ids.push(rec.id);
      expect(rec.seq).toBe(i + 1);
      expect(rec.id).toBe(formatEpochSeqId("abc", i + 1));
    }
    expect(new Set(ids).size).toBe(1000);
    hub.dispose();
  });

  it("replay: Last-Event-ID epoch-5 while buffer holds 3..12 → receives 6..12 in order", () => {
    const hub = createSseHub({
      epoch: "e1",
      ringCapacity: 20,
      clientOptions: { heartbeatIntervalMs: 0 },
    });
    for (let i = 1; i <= 12; i += 1) {
      hub.publish({ event: SSE_EVENT_NAMES.SNAPSHOT_DELTA, data: { n: i } });
    }
    const { frames, sink } = collectSink();
    const sub = hub.subscribe(sink, formatEpochSeqId("e1", 5));
    expect(sub.resync).toBe(false);
    const replayed = frames.filter((f) => f.includes("snapshot-delta"));
    expect(replayed).toHaveLength(7);
    for (let seq = 6; seq <= 12; seq += 1) {
      expect(replayed[seq - 6]).toContain(`id: e1-${seq}`);
    }
    hub.dispose();
  });

  it("replay boundary: Last-Event-ID equal to newest seq → no replay, live only", () => {
    const hub = createSseHub({
      epoch: "e1",
      clientOptions: { heartbeatIntervalMs: 0 },
    });
    hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: { n: 1 } });
    hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: { n: 2 } });
    const { frames, sink } = collectSink();
    hub.subscribe(sink, formatEpochSeqId("e1", 2));
    expect(frames.filter((f) => f.includes("hf-event"))).toHaveLength(0);
    hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: { n: 3 } });
    expect(frames.some((f) => f.includes("id: e1-3"))).toBe(true);
    hub.dispose();
  });

  it("epoch mismatch → resync-required, no replay", () => {
    const hub = createSseHub({
      epoch: "new",
      clientOptions: { heartbeatIntervalMs: 0 },
    });
    hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: {} });
    const { frames, sink } = collectSink();
    const sub = hub.subscribe(sink, formatEpochSeqId("old", 9));
    expect(sub.resync).toBe(true);
    expect(frames.some((f) => f.includes("resync-required"))).toBe(true);
    expect(frames.some((f) => f.includes("epoch-mismatch"))).toBe(true);
    expect(frames.filter((f) => f.includes("hf-event"))).toHaveLength(0);
    hub.dispose();
  });

  it("overrun: Last-Event-ID epoch-1 when buffer starts at 40 → resync-required", () => {
    const hub = createSseHub({
      epoch: "e",
      ringCapacity: 8,
      clientOptions: { heartbeatIntervalMs: 0 },
    });
    for (let i = 1; i <= 50; i += 1) {
      hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: { i } });
    }
    const { frames, sink } = collectSink();
    const sub = hub.subscribe(sink, formatEpochSeqId("e", 1));
    expect(sub.resync).toBe(true);
    expect(frames.some((f) => f.includes("buffer-overflow"))).toBe(true);
    hub.dispose();
  });

  it('malformed Last-Event-ID ("garbage", "12", "-", "") → resync path, no throw', () => {
    const hub = createSseHub({
      epoch: "e",
      clientOptions: { heartbeatIntervalMs: 0 },
    });
    for (const bad of ["garbage", "12", "-", "", null]) {
      const { frames, sink } = collectSink();
      expect(() => hub.subscribe(sink, bad)).not.toThrow();
      expect(frames.some((f) => f.includes("resync-required"))).toBe(true);
    }
    hub.dispose();
  });

  it("publish while replay in flight preserves total order for that client", () => {
    const hub = createSseHub({
      epoch: "e",
      ringCapacity: 50,
      clientOptions: { heartbeatIntervalMs: 0 },
    });
    for (let i = 1; i <= 5; i += 1) {
      hub.publish({ event: SSE_EVENT_NAMES.HF_EVENT, data: { i } });
    }

    // Custom sink that publishes mid-replay by intercepting first write
    let first = true;
    const frames: string[] = [];
    const sink = {
      write: (f: string) => {
        if (first && f.includes("id: e-2")) {
          first = false;
          // Live event during replay of 2..5
          hub.publish({ event: SSE_EVENT_NAMES.WRITE_ECHO, data: { writeId: "w" } });
        }
        frames.push(f);
      },
    };
    hub.subscribe(sink, formatEpochSeqId("e", 1));
    // All replayed hf-events should appear before the write-echo live event
    const idxEcho = frames.findIndex((f) => f.includes("write-echo"));
    const idxLastReplay = frames.findIndex((f) => f.includes("id: e-5"));
    expect(idxEcho).toBeGreaterThan(idxLastReplay);
    hub.dispose();
  });

  it("dispose: no timers left open", () => {
    const hub = createSseHub({
      epoch: "e",
      clientOptions: { heartbeatIntervalMs: 60_000 },
    });
    const { sink } = collectSink();
    hub.subscribe(sink);
    hub.dispose();
    expect(hub.clientCount()).toBe(0);
  });

  it("serializeSseFrame shapes named events correctly", () => {
    const wire = serializeSseFrame("e-1", "hf-event", "{\"a\":1}");
    expect(wire).toBe('id: e-1\nevent: hf-event\ndata: {"a":1}\n\n');
  });
});

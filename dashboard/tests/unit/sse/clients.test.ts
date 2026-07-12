import { describe, expect, it, vi } from "vitest";
import {
  createClientRegistry,
  SSE_HEARTBEAT_FRAME,
} from "../../../src/server/sse/clients.js";

function fakeClock() {
  let handle = 0;
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  return {
    clock: {
      setInterval: (fn: () => void, ms: number) => {
        handle += 1;
        intervals.set(handle, { fn, ms });
        return handle;
      },
      clearInterval: (h: unknown) => {
        intervals.delete(h as number);
      },
    },
    tickAll: () => {
      for (const { fn } of intervals.values()) fn();
    },
    count: () => intervals.size,
  };
}

describe("clients registry", () => {
  it("heartbeat comment frame reaches all registered sinks each interval tick", () => {
    const fc = fakeClock();
    const reg = createClientRegistry({
      clock: fc.clock,
      heartbeatIntervalMs: 1000,
    });
    const a: string[] = [];
    const b: string[] = [];
    reg.register("a", { write: (f) => { a.push(f); } });
    reg.register("b", { write: (f) => { b.push(f); } });
    fc.tickAll();
    expect(a).toContain(SSE_HEARTBEAT_FRAME);
    expect(b).toContain(SSE_HEARTBEAT_FRAME);
    reg.dispose();
    expect(fc.count()).toBe(0);
  });

  it("sink that throws on write is reaped; subsequent broadcast reaches survivors", () => {
    const reg = createClientRegistry({ heartbeatIntervalMs: 0 });
    const good: string[] = [];
    reg.register("bad", {
      write: () => {
        throw new Error("broken");
      },
    });
    reg.register("good", { write: (f) => { good.push(f); } });
    reg.broadcast("event: x\ndata: 1\n\n");
    expect(reg.has("bad")).toBe(false);
    expect(reg.has("good")).toBe(true);
    reg.broadcast("event: y\ndata: 2\n\n");
    expect(good.some((f) => f.includes("event: y"))).toBe(true);
    reg.dispose();
  });

  it("dispose cancels timer and closes all clients", () => {
    const fc = fakeClock();
    const close = vi.fn();
    const reg = createClientRegistry({ clock: fc.clock, heartbeatIntervalMs: 50 });
    reg.register("c", { write: () => undefined, close });
    expect(fc.count()).toBe(1);
    reg.dispose();
    expect(fc.count()).toBe(0);
    expect(reg.size()).toBe(0);
    expect(close).toHaveBeenCalled();
  });
});

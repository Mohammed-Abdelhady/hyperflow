/**
 * SSE client registry: sinks, heartbeats, reaping on write failure.
 * Heartbeats are comment frames and never consume seq ids.
 */

/** Heartbeat interval for SSE comment frames (ms). */
export const SSE_HEARTBEAT_INTERVAL_MS = 15_000;

/** SSE comment heartbeat payload (no event name, no id). */
export const SSE_HEARTBEAT_FRAME = ":hb\n\n";

export type ClientSink = {
  /** Write a fully-serialized SSE frame. Throws / returns false on failure. */
  write: (frame: string) => void | boolean;
  /** Optional close hook when reaped or disposed. */
  close?: () => void;
};

export type ClientRegistryClock = {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

export type ClientRegistryOptions = {
  heartbeatIntervalMs?: number | undefined;
  clock?: ClientRegistryClock | undefined;
  /** Override heartbeat frame (tests). */
  heartbeatFrame?: string | undefined;
};

export type ClientRegistry = {
  register: (id: string, sink: ClientSink) => void;
  unregister: (id: string) => void;
  /** Write frame to every live client; reaps failures. Returns surviving count. */
  broadcast: (frame: string) => number;
  /** Write to one client; reaps on failure. */
  writeTo: (id: string, frame: string) => boolean;
  has: (id: string) => boolean;
  size: () => number;
  ids: () => string[];
  dispose: () => void;
};

const systemClock: ClientRegistryClock = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

export function createClientRegistry(
  options: ClientRegistryOptions = {},
): ClientRegistry {
  const clients = new Map<string, ClientSink>();
  const clock = options.clock ?? systemClock;
  const intervalMs = options.heartbeatIntervalMs ?? SSE_HEARTBEAT_INTERVAL_MS;
  const hbFrame = options.heartbeatFrame ?? SSE_HEARTBEAT_FRAME;

  let timer: unknown = null;

  function safeWrite(id: string, sink: ClientSink, frame: string): boolean {
    try {
      const result = sink.write(frame);
      if (result === false) {
        reap(id);
        return false;
      }
      return true;
    } catch {
      reap(id);
      return false;
    }
  }

  function reap(id: string): void {
    const sink = clients.get(id);
    if (!sink) return;
    clients.delete(id);
    try {
      sink.close?.();
    } catch {
      /* ignore */
    }
  }

  function startHeartbeat(): void {
    if (timer !== null || intervalMs <= 0) return;
    timer = clock.setInterval(() => {
      broadcast(hbFrame);
    }, intervalMs);
  }

  function broadcast(frame: string): number {
    for (const id of [...clients.keys()]) {
      const sink = clients.get(id);
      if (!sink) continue;
      safeWrite(id, sink, frame);
    }
    return clients.size;
  }

  return {
    register(id, sink) {
      // Replace existing id
      if (clients.has(id)) reap(id);
      clients.set(id, sink);
      startHeartbeat();
    },
    unregister(id) {
      reap(id);
    },
    broadcast,
    writeTo(id, frame) {
      const sink = clients.get(id);
      if (!sink) return false;
      return safeWrite(id, sink, frame);
    },
    has: (id) => clients.has(id),
    size: () => clients.size,
    ids: () => [...clients.keys()],
    dispose() {
      if (timer !== null) {
        clock.clearInterval(timer);
        timer = null;
      }
      for (const id of [...clients.keys()]) reap(id);
    },
  };
}

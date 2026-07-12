import {
  ResyncRequiredPayloadSchema,
  SSE_EVENT_NAMES,
  SnapshotDeltaSchema,
  WriteEchoPayloadSchema,
  type SnapshotDelta,
  type WriteEchoPayload,
} from "@shared/schemas/index.js";
import {
  SSE_HEARTBEAT_STALE_MS,
  SSE_WAKE_STALE_MS,
} from "../constants/store";
import { HydrationBuffer, compareEpochSeq } from "./sse-buffer";

export type SseLifecycleStatus =
  | "connecting"
  | "live"
  | "buffering"
  | "resyncing"
  | "dead";

export interface SseHandlers {
  onDelta: (id: string, delta: SnapshotDelta) => void;
  onWriteEcho: (echo: WriteEchoPayload) => void;
  onResyncRequired: (reason: string) => void;
  onStatus: (status: SseLifecycleStatus) => void;
  onHfEvent?: (id: string, data: unknown) => void;
}

export interface SseManagerOptions {
  buildUrl: (lastEventId?: string | null) => string;
  getLastEventId: () => string | null;
  getLastEventAt: () => number | null;
  handlers: SseHandlers;
  EventSourceImpl?: typeof EventSource;
  now?: () => number;
  heartbeatStaleMs?: number;
  wakeStaleMs?: number;
}

export function createSseManager(options: SseManagerOptions) {
  const EventSourceImpl = options.EventSourceImpl ?? EventSource;
  const now = options.now ?? (() => Date.now());
  const heartbeatStaleMs = options.heartbeatStaleMs ?? SSE_HEARTBEAT_STALE_MS;
  const wakeStaleMs = options.wakeStaleMs ?? SSE_WAKE_STALE_MS;

  let source: EventSource | null = null;
  let buffer = new HydrationBuffer();
  let hydrated = false;
  let disposed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastFrameAt = now();

  const setStatus = (status: SseLifecycleStatus) => {
    options.handlers.onStatus(status);
  };

  const handleNamed = (name: string, id: string, data: string) => {
    lastFrameAt = now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return;
    }

    if (name === SSE_EVENT_NAMES.SNAPSHOT_DELTA) {
      const delta = SnapshotDeltaSchema.safeParse(parsed);
      if (!delta.success) return;
      if (!hydrated && buffer.isOpen()) {
        buffer.push(id, delta.data);
        setStatus("buffering");
        return;
      }
      options.handlers.onDelta(id, delta.data);
      return;
    }

    if (name === SSE_EVENT_NAMES.WRITE_ECHO) {
      const echo = WriteEchoPayloadSchema.safeParse(parsed);
      if (!echo.success) return;
      options.handlers.onWriteEcho(echo.data);
      return;
    }

    if (name === SSE_EVENT_NAMES.RESYNC_REQUIRED) {
      const payload = ResyncRequiredPayloadSchema.safeParse(parsed);
      options.handlers.onResyncRequired(
        payload.success ? payload.data.reason : "unknown",
      );
      return;
    }

    if (name === SSE_EVENT_NAMES.HF_EVENT) {
      options.handlers.onHfEvent?.(id, parsed);
    }
    // Unknown names ignored (additive-only).
  };

  const wire = (es: EventSource) => {
    for (const name of Object.values(SSE_EVENT_NAMES)) {
      es.addEventListener(name, (ev: Event) => {
        const msg = ev as MessageEvent<string>;
        const id = typeof msg.lastEventId === "string" ? msg.lastEventId : "";
        handleNamed(name, id, msg.data);
      });
    }
    es.onerror = () => {
      if (disposed) return;
      setStatus("dead");
    };
    es.onopen = () => {
      lastFrameAt = now();
      setStatus(hydrated ? "live" : "buffering");
    };
  };

  const connect = (lastEventId?: string | null) => {
    if (disposed) return;
    disconnectSource();
    setStatus("connecting");
    // Never log stream URL (contains token query param).
    const url = options.buildUrl(lastEventId ?? options.getLastEventId());
    source = new EventSourceImpl(url);
    wire(source);
  };

  const disconnectSource = () => {
    if (source) {
      source.close();
      source = null;
    }
  };

  const markHydrated = (watermark: string | null) => {
    hydrated = true;
    const pending = buffer.flush(watermark);
    for (const item of pending) {
      if (
        watermark &&
        compareEpochSeq(item.id, watermark) <= 0
      ) {
        continue;
      }
      options.handlers.onDelta(item.id, item.delta);
    }
    setStatus("live");
  };

  const forceResync = () => {
    setStatus("resyncing");
    hydrated = false;
    buffer = new HydrationBuffer();
    options.handlers.onResyncRequired("manual");
  };

  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    const lastAt = options.getLastEventAt() ?? lastFrameAt;
    if (now() - lastAt > wakeStaleMs) {
      forceResync();
    }
  };

  const startHeartbeatWatch = () => {
    stopHeartbeatWatch();
    heartbeatTimer = setInterval(() => {
      if (now() - lastFrameAt > heartbeatStaleMs) {
        setStatus("dead");
        disconnectSource();
        connect(options.getLastEventId());
      }
    }, Math.min(5_000, heartbeatStaleMs / 2));
  };

  const stopHeartbeatWatch = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", onVisibility);
  }

  return {
    connect,
    disconnect: () => {
      stopHeartbeatWatch();
      disconnectSource();
    },
    markHydrated,
    forceResync,
    startHeartbeatWatch,
    stopHeartbeatWatch,
    dispose: () => {
      disposed = true;
      stopHeartbeatWatch();
      disconnectSource();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onVisibility);
      }
    },
    /** Test seam: inject a named frame. */
    _handleNamed: handleNamed,
  };
}

export type SseManager = ReturnType<typeof createSseManager>;

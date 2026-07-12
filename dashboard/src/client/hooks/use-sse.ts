import { useEffect, useRef } from "react";
import {
  SnapshotDeltaSchema,
  WriteEchoPayloadSchema,
  type EventLineResult,
} from "@shared/schemas/index.js";
import { apiClient } from "../services/api";
import { createLeaderElection, type LeaderElection } from "../services/leader";
import { createSseManager, type SseManager } from "../services/sse";
import { useEventsStore } from "../stores/events";
import { useSnapshotStore } from "../stores/snapshot";
import { readSessionToken } from "../utils/handshake";

let mounted = false;

/**
 * App-level SSE + leader election. Mount once in the shell.
 * Enforces single instance via module flag.
 */
export function useSse(enabled = true): void {
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    if (mounted) return;
    mounted = true;
    started.current = true;

    const store = useSnapshotStore;
    const events = useEventsStore;

    let sse: SseManager | null = null;
    let leader: LeaderElection | null = null;

    const applyFrame = (id: string, name: string, data: string) => {
      if (name === "snapshot-delta") {
        try {
          const delta = SnapshotDeltaSchema.parse(JSON.parse(data));
          store.getState().applyDelta(id, delta);
          store.getState().setConnection({ lastEventAt: Date.now() });
        } catch {
          /* ignore malformed */
        }
        return;
      }
      if (name === "write-echo") {
        try {
          const echo = WriteEchoPayloadSchema.parse(JSON.parse(data));
          store.getState().applyWriteEcho(echo);
        } catch {
          /* ignore */
        }
        return;
      }
      if (name === "hf-event") {
        try {
          const line = JSON.parse(data) as EventLineResult;
          events.getState().append([{ id, line }]);
        } catch {
          /* ignore */
        }
      }
      if (name === "resync-required") {
        void resync();
      }
    };

    const resync = async () => {
      store.getState().resetForResync();
      try {
        const snapshot = await apiClient.getSnapshot();
        store.getState().hydrate(snapshot, snapshot.meta.lastEventId);
        if (leader?.isLeader()) {
          sse?.connect(snapshot.meta.lastEventId);
        }
      } catch {
        store.getState().setConnection({ streamStatus: "dead" });
      }
    };

    sse = createSseManager({
      buildUrl: (last) => apiClient.buildStreamUrl(last),
      getLastEventId: () => store.getState().connection.lastEventId,
      getLastEventAt: () => store.getState().connection.lastEventAt,
      handlers: {
        onDelta: (id, delta) => {
          store.getState().applyDelta(id, delta);
          store.getState().setConnection({ lastEventAt: Date.now() });
          leader?.broadcastEvent(id, "snapshot-delta", JSON.stringify(delta));
        },
        onWriteEcho: (echo) => {
          store.getState().applyWriteEcho(echo);
          leader?.broadcastEvent(
            echo.writeId,
            "write-echo",
            JSON.stringify(echo),
          );
        },
        onResyncRequired: () => {
          void resync();
        },
        onStatus: (status) => {
          const map = {
            connecting: "connecting",
            live: "live",
            buffering: "connecting",
            resyncing: "resyncing",
            dead: "reconnecting",
          } as const;
          store.getState().setConnection({ streamStatus: map[status] });
        },
        onHfEvent: (id, data) => {
          events.getState().append([{ id, line: data as EventLineResult }]);
          leader?.broadcastEvent(id, "hf-event", JSON.stringify(data));
        },
      },
    });

    leader = createLeaderElection({
      onBecomeLeader: () => {
        store.getState().setConnection({ isLeader: true });
        sse?.connect(store.getState().connection.lastEventId);
        sse?.startHeartbeatWatch();
      },
      onBecomeFollower: () => {
        store.getState().setConnection({ isLeader: false });
        // Followers do not own EventSource — leader rebroadcasts.
        sse?.disconnect();
      },
      onEvent: (frame) => {
        applyFrame(frame.id, frame.name, frame.data);
      },
    });

    leader.requestToken();

    void (async () => {
      // Wait briefly for token handoff if empty.
      if (!readSessionToken()) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!readSessionToken()) {
        store.getState().setConnection({ streamStatus: "unauthenticated" });
        return;
      }
      try {
        store.getState().setConnection({ streamStatus: "connecting" });
        const snapshot = await apiClient.getSnapshot();
        store.getState().hydrate(snapshot, snapshot.meta.lastEventId);
        sse?.markHydrated(snapshot.meta.lastEventId);
      } catch {
        store.getState().setConnection({ streamStatus: "dead" });
      }
    })();

    return () => {
      mounted = false;
      started.current = false;
      sse?.dispose();
      leader?.dispose();
    };
  }, [enabled]);
}

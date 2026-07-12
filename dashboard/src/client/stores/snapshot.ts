import { create } from "zustand";
import type {
  Snapshot,
  SnapshotDelta,
  WriteEchoPayload,
} from "@shared/schemas/index.js";
import type {
  ConnectionStreamStatus,
  FidelityMode,
} from "../types/ui";
import {
  applySnapshotDelta,
  applyWriteEchoToSnapshot,
  type OptimisticEntry,
} from "./delta-apply";

export interface ConnectionSlice {
  streamStatus: ConnectionStreamStatus;
  lastEventId: string | null;
  epoch: string | number | null;
  fidelity: FidelityMode;
  observeMode: boolean;
  resyncInProgress: boolean;
  unknownDeltaCount: number;
  isLeader: boolean;
  lastEventAt: number | null;
}

export interface SnapshotStoreState {
  data: Snapshot | null;
  connection: ConnectionSlice;
  optimistic: OptimisticEntry[];
  hydrated: boolean;

  hydrate: (snapshot: Snapshot, watermark?: string | null) => void;
  applyDelta: (eventId: string, delta: SnapshotDelta) => void;
  applyWriteEcho: (echo: WriteEchoPayload) => void;
  resetForResync: () => void;
  setConnection: (patch: Partial<ConnectionSlice>) => void;
  pushOptimistic: (entry: OptimisticEntry) => void;
  rollbackOptimistic: (writeId: string) => void;
}

const initialConnection = (): ConnectionSlice => ({
  streamStatus: "idle",
  lastEventId: null,
  epoch: null,
  fidelity: "full",
  observeMode: false,
  resyncInProgress: false,
  unknownDeltaCount: 0,
  isLeader: false,
  lastEventAt: null,
});

export function createSnapshotStore() {
  return create<SnapshotStoreState>((set, get) => ({
    data: null,
    connection: initialConnection(),
    optimistic: [],
    hydrated: false,

    hydrate: (snapshot, watermark) => {
      const lastEventId =
        watermark !== undefined ? watermark : snapshot.meta.lastEventId;
      const reduced = snapshot.events.reducedFidelity === true;
      set({
        data: snapshot,
        hydrated: true,
        optimistic: [],
        connection: {
          ...get().connection,
          lastEventId,
          epoch: snapshot.meta.epoch,
          observeMode: snapshot.meta.observeMode,
          fidelity: reduced ? "reduced" : "full",
          resyncInProgress: false,
          streamStatus:
            get().connection.streamStatus === "unauthenticated"
              ? "unauthenticated"
              : "live",
        },
      });
    },

    applyDelta: (eventId, delta) => {
      const { data, connection } = get();
      if (!data) return;
      const result = applySnapshotDelta(data, delta);
      const reduced = result.snapshot.events.reducedFidelity === true;
      set({
        data: result.snapshot,
        connection: {
          ...connection,
          lastEventId: eventId,
          unknownDeltaCount:
            connection.unknownDeltaCount + result.unknownOps,
          fidelity: reduced ? "reduced" : connection.fidelity,
          observeMode: result.snapshot.meta.observeMode,
        },
      });
    },

    applyWriteEcho: (echo) => {
      const { data, optimistic, connection } = get();
      if (!data) return;
      const result = applyWriteEchoToSnapshot(data, optimistic, echo);
      set({
        data: result.snapshot,
        optimistic: result.optimistic,
        connection: {
          ...connection,
          unknownDeltaCount:
            connection.unknownDeltaCount + result.unknownOps,
        },
      });
    },

    resetForResync: () => {
      set({
        data: null,
        hydrated: false,
        optimistic: [],
        connection: {
          ...get().connection,
          resyncInProgress: true,
          streamStatus: "resyncing",
          lastEventId: null,
        },
      });
    },

    setConnection: (patch) => {
      set({ connection: { ...get().connection, ...patch } });
    },

    pushOptimistic: (entry) => {
      set({ optimistic: [...get().optimistic, entry] });
    },

    rollbackOptimistic: (writeId) => {
      set({
        optimistic: get().optimistic.filter((o) => o.writeId !== writeId),
      });
    },
  }));
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;

/** Process-singleton store for the SPA. Tests call createSnapshotStore(). */
export const useSnapshotStore = createSnapshotStore();

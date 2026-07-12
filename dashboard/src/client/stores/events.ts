import { create } from "zustand";
import type { EventLineResult } from "@shared/schemas/index.js";
import { EVENT_FEED_RETENTION_CAP } from "../constants/store";

export interface StoredEvent {
  /** Stable client/store id (SSE id or synthetic range key). */
  id: string;
  line: EventLineResult;
}

export interface EventsStoreState {
  items: StoredEvent[];
  retentionCap: number;

  append: (events: StoredEvent[]) => void;
  mergeRange: (events: StoredEvent[]) => void;
  reset: () => void;
  setRetentionCap: (cap: number) => void;
}

function dropOldest(items: StoredEvent[], cap: number): StoredEvent[] {
  if (items.length <= cap) return items;
  return items.slice(items.length - cap);
}

function coalesceById(existing: StoredEvent[], incoming: StoredEvent[]): StoredEvent[] {
  const map = new Map<string, StoredEvent>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  // Preserve arrival order: existing order first, then new ids in incoming order.
  const order: string[] = [];
  const seen = new Set<string>();
  for (const item of existing) {
    if (!seen.has(item.id)) {
      order.push(item.id);
      seen.add(item.id);
    }
  }
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      order.push(item.id);
      seen.add(item.id);
    }
  }
  return order.map((id) => map.get(id)!);
}

export function createEventsStore(cap = EVENT_FEED_RETENTION_CAP) {
  return create<EventsStoreState>((set, get) => ({
    items: [],
    retentionCap: cap,

    append: (events) => {
      const merged = coalesceById(get().items, events);
      set({ items: dropOldest(merged, get().retentionCap) });
    },

    mergeRange: (events) => {
      // Range backfill may include older ids — merge then enforce cap.
      const merged = coalesceById(get().items, events);
      set({ items: dropOldest(merged, get().retentionCap) });
    },

    reset: () => set({ items: [] }),

    setRetentionCap: (nextCap) => {
      set({
        retentionCap: nextCap,
        items: dropOldest(get().items, nextCap),
      });
    },
  }));
}

export type EventsStore = ReturnType<typeof createEventsStore>;

export const useEventsStore = createEventsStore();

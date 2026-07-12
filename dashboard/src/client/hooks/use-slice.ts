import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  useEventsStore,
  type EventsStoreState,
} from "../stores/events";
import {
  useReplayStore,
  type ReplayStoreState,
} from "../stores/replay";
import {
  useSnapshotStore,
  type SnapshotStoreState,
} from "../stores/snapshot";
import { useUiStore, type UiStoreState } from "../stores/ui";

/** Subscribe to a slice of the snapshot store. */
export function useSnapshotSlice<T>(
  selector: (s: SnapshotStoreState) => T,
): T {
  return useStore(useSnapshotStore, selector);
}

export function useConnectionSlice() {
  return useSnapshotSlice(useShallow((s) => s.connection));
}

export function useSnapshotData() {
  return useSnapshotSlice((s) => s.data);
}

export function useEventsSlice<T>(selector: (s: EventsStoreState) => T): T {
  return useStore(useEventsStore, selector);
}

export function useReplaySlice<T>(selector: (s: ReplayStoreState) => T): T {
  return useStore(useReplayStore, selector);
}

export function useUiSlice<T>(selector: (s: UiStoreState) => T): T {
  return useStore(useUiStore, selector);
}

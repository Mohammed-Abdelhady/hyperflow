import { create } from "zustand";

export type PlaybackState = "idle" | "playing" | "paused" | "scrubbing";

export interface ReplayStoreState {
  /** Normalized 0..1 scrubber position along the timeline. */
  position: number;
  /** Global flag that zeroes motion durations app-wide while true. */
  scrubbing: boolean;
  playback: PlaybackState;
  /** Index into the events timeline (store or range-fetched). */
  eventIndex: number;
  stageIndex: number;
  /** Event ids currently referenced by the timeline (retention coordination). */
  timelineEventIds: string[];

  setPosition: (position: number) => void;
  setScrubbing: (scrubbing: boolean) => void;
  setPlayback: (playback: PlaybackState) => void;
  setEventIndex: (index: number) => void;
  setStageIndex: (index: number) => void;
  setTimelineEventIds: (ids: string[]) => void;
  stepEvent: (delta: number) => void;
  stepStage: (delta: number) => void;
  reset: () => void;
}

const initial = {
  position: 0,
  scrubbing: false,
  playback: "idle" as PlaybackState,
  eventIndex: 0,
  stageIndex: 0,
  timelineEventIds: [] as string[],
};

export function createReplayStore() {
  return create<ReplayStoreState>((set, get) => ({
    ...initial,

    setPosition: (position) =>
      set({ position: Math.min(1, Math.max(0, position)) }),

    setScrubbing: (scrubbing) =>
      set({
        scrubbing,
        playback: scrubbing ? "scrubbing" : get().playback === "scrubbing" ? "paused" : get().playback,
      }),

    setPlayback: (playback) => set({ playback }),

    setEventIndex: (eventIndex) => set({ eventIndex: Math.max(0, eventIndex) }),

    setStageIndex: (stageIndex) => set({ stageIndex: Math.max(0, stageIndex) }),

    setTimelineEventIds: (timelineEventIds) => set({ timelineEventIds }),

    stepEvent: (delta) => {
      const max = Math.max(0, get().timelineEventIds.length - 1);
      const next = Math.min(max, Math.max(0, get().eventIndex + delta));
      const position = max === 0 ? 0 : next / max;
      set({ eventIndex: next, position });
    },

    stepStage: (delta) => {
      set({ stageIndex: Math.max(0, get().stageIndex + delta) });
    },

    reset: () => set({ ...initial, timelineEventIds: [] }),
  }));
}

export type ReplayStore = ReturnType<typeof createReplayStore>;

export const useReplayStore = createReplayStore();

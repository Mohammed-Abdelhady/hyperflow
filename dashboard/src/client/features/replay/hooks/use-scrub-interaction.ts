import { useCallback } from "react";
import { useReplayStore } from "../../../stores/replay";
import {
  eventIndexToProgress,
  progressToEventIndex,
  stepStageIndex,
  type TimelineIndex,
} from "./timeline-index";

export interface ScrubInteraction {
  position: number;
  eventIndex: number;
  scrubbing: boolean;
  setPosition: (position: number) => void;
  setScrubbing: (scrubbing: boolean) => void;
  stepEvent: (delta: number) => void;
  stepStage: (delta: number) => void;
  jumpStart: () => void;
  jumpEnd: () => void;
}

export function useScrubInteraction(index: TimelineIndex): ScrubInteraction {
  const position = useReplayStore((s) => s.position);
  const eventIndex = useReplayStore((s) => s.eventIndex);
  const scrubbing = useReplayStore((s) => s.scrubbing);

  const setPosition = useCallback(
    (p: number) => {
      const store = useReplayStore.getState();
      const nextIndex = progressToEventIndex(p, index.eventCount);
      store.setPosition(p);
      store.setEventIndex(nextIndex);
    },
    [index.eventCount],
  );

  const setScrubbing = useCallback((value: boolean) => {
    useReplayStore.getState().setScrubbing(value);
    if (typeof document !== "undefined") {
      if (value) document.documentElement.dataset.scrubbing = "true";
      else delete document.documentElement.dataset.scrubbing;
    }
  }, []);

  const stepEvent = useCallback(
    (delta: number) => {
      if (index.eventCount === 0) return;
      const store = useReplayStore.getState();
      const max = index.eventCount - 1;
      const next = Math.min(max, Math.max(0, store.eventIndex + delta));
      store.setEventIndex(next);
      store.setPosition(eventIndexToProgress(next, index.eventCount));
    },
    [index.eventCount],
  );

  const stepStage = useCallback(
    (delta: number) => {
      if (index.eventCount === 0) return;
      const store = useReplayStore.getState();
      const next = stepStageIndex(
        store.eventIndex,
        index.stageBoundaryIndices,
        delta,
      );
      store.setEventIndex(next);
      store.setPosition(eventIndexToProgress(next, index.eventCount));
    },
    [index.eventCount, index.stageBoundaryIndices],
  );

  const jumpStart = useCallback(() => {
    if (index.eventCount === 0) return;
    const store = useReplayStore.getState();
    store.setEventIndex(0);
    store.setPosition(0);
  }, [index.eventCount]);

  const jumpEnd = useCallback(() => {
    if (index.eventCount === 0) return;
    const store = useReplayStore.getState();
    const last = index.eventCount - 1;
    store.setEventIndex(last);
    store.setPosition(eventIndexToProgress(last, index.eventCount));
  }, [index.eventCount]);

  return {
    position,
    eventIndex,
    scrubbing,
    setPosition,
    setScrubbing,
    stepEvent,
    stepStage,
    jumpStart,
    jumpEnd,
  };
}

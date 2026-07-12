import { useMemo } from "react";
import { useEventsSlice } from "../../../hooks/use-slice";
import { buildTimelineIndex, type TimelineIndex } from "./timeline-index";

export function useTimelineIndex(): TimelineIndex {
  const items = useEventsSlice((s) => s.items);
  return useMemo(() => buildTimelineIndex(items), [items]);
}

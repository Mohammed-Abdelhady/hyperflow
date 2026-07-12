import { useEffect, useRef, useState } from "react";
import type { StoredEvent } from "../../../stores/events";
import { useEventsSlice } from "../../../hooks/use-slice";
import { useReplayStore } from "../../../stores/replay";
import {
  COALESCE_WINDOW_MS,
  createCoalesceState,
  pushEvents,
  type AppendMode,
  type CoalesceState,
} from "./stream-coalesce";

export interface StreamRow {
  id: string;
  timestamp: string;
  message: string;
  severity: "pass" | "fix" | "blocked" | "live" | "queued";
  animateEnter: boolean;
  marker: boolean;
}

function toMessage(ev: StoredEvent): StreamRow {
  const line = ev.line;
  if (line.variant === "v1") {
    const e = line.event;
    const severity =
      e.status?.toUpperCase().includes("FAIL") ||
      e.type.toUpperCase().includes("FAIL")
        ? "blocked"
        : e.type.toUpperCase().includes("WARN")
          ? "fix"
          : e.type.toUpperCase().includes("START")
            ? "live"
            : "queued";
    return {
      id: ev.id,
      timestamp: e.ts,
      message: [e.type, e.agent, e.task].filter(Boolean).join(" · "),
      severity,
      animateEnter: true,
      marker: false,
    };
  }
  return {
    id: ev.id,
    timestamp: line.ts ?? "",
    message: line.type ?? "opaque event",
    severity: "queued",
    animateEnter: true,
    marker: false,
  };
}

export function useStreamCoalesce(): {
  rows: StreamRow[];
  mode: AppendMode;
} {
  const items = useEventsSlice((s) => s.items);
  const scrubbing = useReplayStore((s) => s.scrubbing);
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [mode, setMode] = useState<AppendMode>("animate");
  const stateRef = useRef<CoalesceState<StoredEvent>>(createCoalesceState());
  const seenRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fresh = items.filter((i) => !seenRef.current.has(i.id));
    if (fresh.length === 0) return;
    for (const f of fresh) seenRef.current.add(f.id);

    const now = performance.now();
    const { state, batches } = pushEvents(stateRef.current, fresh, now, false);
    stateRef.current = state;

    const apply = (batchMode: AppendMode, batchItems: StoredEvent[]) => {
      const animate = !scrubbing && batchMode === "animate";
      setMode(batchMode);
      setRows((prev) => [
        ...prev,
        ...batchItems.map((ev, i) => {
          const row = toMessage(ev);
          return {
            ...row,
            animateEnter: animate && i < 3,
            marker: batchMode === "snap",
          };
        }),
      ]);
    };

    for (const b of batches) apply(b.mode, b.items);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (stateRef.current.buffer.length > 0) {
      timerRef.current = setTimeout(() => {
        const tick = performance.now();
        const flushed = pushEvents(stateRef.current, [], tick, true);
        stateRef.current = flushed.state;
        for (const b of flushed.batches) apply(b.mode, b.items);
      }, COALESCE_WINDOW_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [items, scrubbing]);

  // Hydrate initial window without animation.
  useEffect(() => {
    if (rows.length > 0 || items.length === 0) return;
    const initial = items.slice(-100);
    for (const i of initial) seenRef.current.add(i.id);
    setRows(
      initial.map((ev) => ({
        ...toMessage(ev),
        animateEnter: false,
        marker: false,
      })),
    );
  }, [items, rows.length]);

  return { rows, mode };
}

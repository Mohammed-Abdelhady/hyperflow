import type { EventLineResult } from "@shared/schemas/index.js";
import type { StoredEvent } from "../../../stores/events";
import {
  clamp01,
  indexToProgress,
  nearestBoundaryIndex,
} from "../../../utils/chainline-geometry";

export interface TimelineBoundary {
  index: number;
  eventId: string;
  ts: string | null;
  stageKey: string | null;
  label: string;
}

export interface TimelineIndex {
  /** Number of events on the timeline. */
  eventCount: number;
  /** Distinct stage keys in order of first appearance. */
  stageKeys: string[];
  /** Per-event boundaries (one per event). */
  eventBoundaries: TimelineBoundary[];
  /** Stage-boundary event indices (first event of each stage). */
  stageBoundaryIndices: number[];
  /** Scrubber disabled when fewer than 2 events. */
  scrubEnabled: boolean;
  /** Scale factor for progress ↔ index (always finite). */
  scale: number;
  /** Degraded when no events present. */
  degraded: boolean;
  /** Single-event note for §4.7. */
  singleEvent: boolean;
}

function eventTs(line: EventLineResult): string | null {
  if (line.variant === "v1") return line.event.ts;
  return line.ts ?? null;
}

function eventStage(line: EventLineResult): string | null {
  if (line.variant === "v1") {
    return line.event.batch ?? line.event.skill ?? line.event.chain ?? null;
  }
  return line.type ?? null;
}

function eventLabel(line: EventLineResult): string {
  if (line.variant === "v1") {
    const parts = [line.event.type, line.event.agent, line.event.task].filter(
      Boolean,
    );
    return parts.join(" · ") || line.event.type;
  }
  return line.type ?? "opaque event";
}

/** Pure timeline derivation — no store access. Guarded against 0/1-event scale. */
export function buildTimelineIndex(
  events: readonly StoredEvent[],
): TimelineIndex {
  if (events.length === 0) {
    return {
      eventCount: 0,
      stageKeys: [],
      eventBoundaries: [],
      stageBoundaryIndices: [],
      scrubEnabled: false,
      scale: 0,
      degraded: true,
      singleEvent: false,
    };
  }

  const eventBoundaries: TimelineBoundary[] = [];
  const stageKeys: string[] = [];
  const stageBoundaryIndices: number[] = [];
  const seenStages = new Set<string>();

  events.forEach((ev, index) => {
    const stageKey = eventStage(ev.line);
    if (stageKey && !seenStages.has(stageKey)) {
      seenStages.add(stageKey);
      stageKeys.push(stageKey);
      stageBoundaryIndices.push(index);
    }
    eventBoundaries.push({
      index,
      eventId: ev.id,
      ts: eventTs(ev.line),
      stageKey,
      label: eventLabel(ev.line),
    });
  });

  const eventCount = events.length;
  // Guard: never NaN/Infinity when count is 0 or 1.
  const scale = eventCount <= 1 ? 0 : 1 / (eventCount - 1);

  return {
    eventCount,
    stageKeys,
    eventBoundaries,
    stageBoundaryIndices:
      stageBoundaryIndices.length > 0 ? stageBoundaryIndices : [0],
    scrubEnabled: eventCount > 1,
    scale,
    degraded: false,
    singleEvent: eventCount === 1,
  };
}

export function progressToEventIndex(
  progress: number,
  eventCount: number,
): number {
  return nearestBoundaryIndex(clamp01(progress), eventCount);
}

export function eventIndexToProgress(
  index: number,
  eventCount: number,
): number {
  return indexToProgress(index, eventCount);
}

/** Next stage boundary index from current event index, direction ±1. */
export function stepStageIndex(
  currentEventIndex: number,
  stageBoundaryIndices: readonly number[],
  delta: number,
): number {
  if (stageBoundaryIndices.length === 0) return currentEventIndex;
  if (delta > 0) {
    for (const idx of stageBoundaryIndices) {
      if (idx > currentEventIndex) return idx;
    }
    return stageBoundaryIndices[stageBoundaryIndices.length - 1]!;
  }
  for (let i = stageBoundaryIndices.length - 1; i >= 0; i -= 1) {
    const idx = stageBoundaryIndices[i]!;
    if (idx < currentEventIndex) return idx;
  }
  return stageBoundaryIndices[0]!;
}

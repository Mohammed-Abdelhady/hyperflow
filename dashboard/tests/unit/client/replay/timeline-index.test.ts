import { describe, expect, it } from "vitest";
import {
  buildTimelineIndex,
  eventIndexToProgress,
  progressToEventIndex,
  stepStageIndex,
} from "../../../../src/client/features/replay/hooks/timeline-index";
import type { StoredEvent } from "../../../../src/client/stores/events";
import { parseEventLine } from "../../../../src/shared/schemas/event-line";

function v1(
  id: string,
  patch: Partial<{
    ts: string;
    chain: string;
    skill: string;
    type: string;
    batch: string;
  }>,
): StoredEvent {
  const line = parseEventLine({
    v: 1,
    ts: patch.ts ?? "2026-01-01T00:00:00Z",
    chain: patch.chain ?? "c",
    skill: patch.skill ?? "s",
    type: patch.type ?? "tick",
    batch: patch.batch,
  });
  return { id, line };
}

describe("buildTimelineIndex", () => {
  it("marks empty as degraded with finite scale", () => {
    const idx = buildTimelineIndex([]);
    expect(idx.degraded).toBe(true);
    expect(idx.scrubEnabled).toBe(false);
    expect(Number.isFinite(idx.scale)).toBe(true);
    expect(idx.scale).toBe(0);
  });

  it("disables scrub for single-event run without NaN scale", () => {
    const idx = buildTimelineIndex([v1("e0", { type: "start" })]);
    expect(idx.singleEvent).toBe(true);
    expect(idx.scrubEnabled).toBe(false);
    expect(Number.isFinite(idx.scale)).toBe(true);
    expect(Number.isNaN(idx.scale)).toBe(false);
    expect(idx.eventCount).toBe(1);
  });

  it("derives event and stage boundaries", () => {
    const events = [
      v1("a", { batch: "b1", type: "start" }),
      v1("b", { batch: "b1", type: "progress" }),
      v1("c", { batch: "b2", type: "start" }),
      v1("d", { batch: "b2", type: "done" }),
    ];
    const idx = buildTimelineIndex(events);
    expect(idx.eventCount).toBe(4);
    expect(idx.scrubEnabled).toBe(true);
    expect(idx.stageKeys).toEqual(["b1", "b2"]);
    expect(idx.stageBoundaryIndices).toEqual([0, 2]);
    expect(idx.eventBoundaries).toHaveLength(4);
  });
});

describe("progress mapping", () => {
  it("maps rail fraction to nearest boundary", () => {
    expect(progressToEventIndex(0, 5)).toBe(0);
    expect(progressToEventIndex(1, 5)).toBe(4);
    expect(progressToEventIndex(0.5, 5)).toBe(2);
  });

  it("maps index to progress at ends", () => {
    expect(eventIndexToProgress(0, 5)).toBe(0);
    expect(eventIndexToProgress(4, 5)).toBe(1);
  });
});

describe("stepStageIndex", () => {
  it("steps to next and previous stage boundaries", () => {
    const stages = [0, 3, 7];
    expect(stepStageIndex(1, stages, 1)).toBe(3);
    expect(stepStageIndex(3, stages, 1)).toBe(7);
    expect(stepStageIndex(5, stages, -1)).toBe(3);
    expect(stepStageIndex(0, stages, -1)).toBe(0);
  });
});

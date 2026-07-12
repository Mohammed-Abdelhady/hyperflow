import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "../../../../src/shared/derived/leaderboard";
import { SnapshotSchema } from "../../../../src/shared/schemas/snapshot";

function emptySnapshot(reduced = false) {
  return SnapshotSchema.parse({
    meta: { epoch: 1, lastEventId: null, observeMode: false },
    tasks: [],
    features: [],
    specs: [],
    audits: [],
    memory: [],
    background: {
      agents: [],
      present: false,
      parseHealth: { state: "ok", diagnostics: [] },
    },
    handoff: [],
    markers: { mode: null, sticky: false },
    commitsQueue: { present: false, items: [] },
    events: {
      present: !reduced,
      reducedFidelity: reduced,
    },
  });
}

describe("leaderboard derived shape", () => {
  it("returns empty rows with stable headers", () => {
    const result = computeLeaderboard(emptySnapshot());
    expect(result.rows).toEqual([]);
    expect(result.headers).toEqual([
      "rank",
      "name",
      "dimension",
      "count",
      "tokens",
    ]);
  });

  it("flags markdown-only via reduced fidelity presence", () => {
    const snap = emptySnapshot(true);
    expect(snap.events.reducedFidelity).toBe(true);
  });
});

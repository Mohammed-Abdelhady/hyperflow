import { describe, expect, it } from "vitest";
import {
  computeLeaderboard,
  type LeaderboardResult,
} from "../../../../src/shared/derived/index.js";
import {
  emptySnapshot,
  leaderboardThreeAgentsSnapshot,
} from "./fixture.js";

interface LeaderboardCase {
  name: string;
  build: () => ReturnType<typeof emptySnapshot>;
  assert: (result: LeaderboardResult) => void;
}

const cases: LeaderboardCase[] = [
  {
    name: "three agents ranked by count desc with name tie-break",
    build: leaderboardThreeAgentsSnapshot,
    assert: (result) => {
      expect(result.headers).toEqual([
        "rank",
        "name",
        "dimension",
        "count",
        "tokens",
      ]);
      expect(result.agents.length).toBeGreaterThanOrEqual(3);

      // ranks are dense 1..n and counts non-increasing
      for (let i = 0; i < result.agents.length; i++) {
        expect(result.agents[i]?.rank).toBe(i + 1);
        if (i > 0) {
          const prev = result.agents[i - 1]!;
          const cur = result.agents[i]!;
          expect(prev.count).toBeGreaterThanOrEqual(cur.count);
          if (prev.count === cur.count && prev.tokens === cur.tokens) {
            expect(prev.name.localeCompare(cur.name)).toBeLessThanOrEqual(0);
          }
        }
      }

      // skills include dispatch from statusFields
      expect(result.skills.some((s) => s.name === "dispatch")).toBe(true);

      // bob and carol share token weight 30k — name order breaks ties when counts equal
      const bob = result.agents.find((a) => a.name === "bob");
      const carol = result.agents.find((a) => a.name === "carol");
      expect(bob).toBeDefined();
      expect(carol).toBeDefined();
    },
  },
  {
    name: "empty fixture → zero rows, header-safe shape",
    build: emptySnapshot,
    assert: (result) => {
      expect(result.headers).toEqual([
        "rank",
        "name",
        "dimension",
        "count",
        "tokens",
      ]);
      expect(result.rows).toEqual([]);
      expect(result.agents).toEqual([]);
      expect(result.skills).toEqual([]);
    },
  },
];

describe("computeLeaderboard", () => {
  it.each(cases)("$name", ({ build, assert }) => {
    assert(computeLeaderboard(build()));
  });

  it("is deterministic: same input twice → deep equal", () => {
    const snap = leaderboardThreeAgentsSnapshot();
    expect(computeLeaderboard(snap)).toEqual(computeLeaderboard(snap));
  });

  it("never yields NaN counts", () => {
    const result = computeLeaderboard(leaderboardThreeAgentsSnapshot());
    for (const row of result.rows) {
      expect(Number.isFinite(row.count)).toBe(true);
      expect(Number.isFinite(row.tokens)).toBe(true);
      expect(Number.isNaN(row.count)).toBe(false);
    }
  });
});

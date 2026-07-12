import { describe, expect, it } from "vitest";
import {
  computeConclusions,
  computeFlowHealth,
  computeLeaderboard,
  computeTokenSpend,
} from "../../../../src/shared/derived/index.js";
import { multiSurfaceFixture } from "./fixture.js";

describe("derived metrics integration", () => {
  const now = 1_700_000_000_000;
  const snap = multiSurfaceFixture(now);

  it("runs all four functions over one multi-surface fixture deterministically", () => {
    const health = computeFlowHealth(snap, now);
    const board = computeLeaderboard(snap);
    const tokens = computeTokenSpend(snap);
    const conclusions = computeConclusions(snap);

    const combined = { health, board, tokens, conclusions };
    const combinedAgain = {
      health: computeFlowHealth(snap, now),
      board: computeLeaderboard(snap),
      tokens: computeTokenSpend(snap),
      conclusions: computeConclusions(snap),
    };
    expect(combined).toEqual(combinedAgain);

    // Structural guards against cross-function drift
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(Number.isNaN(health.score)).toBe(false);

    expect(board.headers).toHaveLength(5);
    expect(Array.isArray(board.rows)).toBe(true);

    expect(tokens.estimatedTotal).toBe(220_000);
    expect(tokens.actualTotal).toBe(240_000);
    expect(tokens.deltaTokens).toBe(20_000);
    expect(Number.isNaN(tokens.totalTokens)).toBe(false);

    expect(conclusions.plans.length).toBeGreaterThan(0);
    for (const plan of conclusions.plans) {
      for (const claim of plan.claims) {
        expect(claim.citations.length).toBeGreaterThan(0);
      }
      expect(Number.isFinite(plan.progressRatio)).toBe(true);
    }

    // Snapshot the combined shape for regression
    expect(combined).toMatchSnapshot();
  });
});

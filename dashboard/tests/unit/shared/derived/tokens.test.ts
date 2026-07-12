import { describe, expect, it } from "vitest";
import {
  computeTokenSpend,
  parseTokenAmount,
  parseTokensUsedLine,
  rollupCostTable,
  type TokenSpendResult,
} from "../../../../src/shared/derived/index.js";
import {
  costTableReviewerWorker,
  emptySnapshot,
  tokensCostTableSnapshot,
  tokensEstimatedAndActualSnapshot,
} from "./fixture.js";

interface TokenCase {
  name: string;
  build: () => ReturnType<typeof emptySnapshot>;
  assert: (result: TokenSpendResult) => void;
}

const cases: TokenCase[] = [
  {
    name: "artefact-format cost table → Reviewer 16/~80k, Worker 14/~140k, Total ~220k",
    build: tokensCostTableSnapshot,
    assert: (result) => {
      expect(result.estimatedTotal).toBe(220_000);
      expect(result.totalTokens).toBe(220_000);
      expect(result.empty).toBe(false);

      const reviewer = result.byRole.find((r) => r.role === "Reviewer");
      const worker = result.byRole.find((r) => r.role === "Worker");
      expect(reviewer).toEqual({
        role: "Reviewer",
        agents: 16,
        tokens: 80_000,
      });
      expect(worker).toEqual({
        role: "Worker",
        agents: 14,
        tokens: 140_000,
      });

      expect(result.byChain[0]?.chain).toBe("plan");
      expect(result.byChain[0]?.estimatedTokens).toBe(220_000);
    },
  },
  {
    name: "Estimated + Actual → delta computed",
    build: tokensEstimatedAndActualSnapshot,
    assert: (result) => {
      expect(result.estimatedTotal).toBe(220_000);
      expect(result.actualTotal).toBe(240_000);
      expect(result.deltaTokens).toBe(20_000);
      expect(result.totalTokens).toBe(240_000);
    },
  },
  {
    name: "empty snapshot → empty flag, zeros, no NaN",
    build: emptySnapshot,
    assert: (result) => {
      expect(result.empty).toBe(true);
      expect(result.totalTokens).toBe(0);
      expect(result.estimatedTotal).toBe(0);
      expect(result.actualTotal).toBe(0);
      expect(result.deltaTokens).toBe(0);
      expect(result.byRole).toEqual([]);
      expect(Number.isNaN(result.totalTokens)).toBe(false);
    },
  },
];

describe("token parsers", () => {
  it.each([
    { raw: "~80k", expected: 80_000 },
    { raw: "89.2k", expected: 89_200 },
    { raw: "1.5m", expected: 1_500_000 },
    { raw: "1200", expected: 1200 },
    { raw: "**~220k**", expected: 220_000 },
    { raw: "", expected: 0 },
    { raw: "n/a", expected: 0 },
  ])("parseTokenAmount($raw) → $expected", ({ raw, expected }) => {
    expect(parseTokenAmount(raw)).toBe(expected);
  });

  it("parseTokensUsedLine extracts roles and skips total", () => {
    const parts = parseTokensUsedLine(
      "thinking 89.2k · worker 142.0k · total 231.2k",
    );
    expect(parts).toEqual([
      { role: "thinking", tokens: 89_200 },
      { role: "worker", tokens: 142_000 },
    ]);
  });

  it("rollupCostTable matches artefact-format fixture", () => {
    const roll = rollupCostTable(costTableReviewerWorker());
    expect(roll.totalTokens).toBe(220_000);
    expect(roll.totalAgents).toBe(30);
    expect(roll.roles).toHaveLength(2);
  });
});

describe("computeTokenSpend", () => {
  it.each(cases)("$name", ({ build, assert }) => {
    assert(computeTokenSpend(build()));
  });

  it("is deterministic: same input twice → deep equal", () => {
    const snap = tokensEstimatedAndActualSnapshot();
    expect(computeTokenSpend(snap)).toEqual(computeTokenSpend(snap));
  });
});

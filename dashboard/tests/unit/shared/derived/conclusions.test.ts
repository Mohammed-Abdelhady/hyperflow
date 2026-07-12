import { describe, expect, it } from "vitest";
import {
  computeConclusions,
  type ConclusionsResult,
  type PlanConclusion,
} from "../../../../src/shared/derived/index.js";
import {
  completedPlanSnapshot,
  emptySnapshot,
  pendingPlanSnapshot,
} from "./fixture.js";

function everyClaimHasCitation(plan: PlanConclusion): boolean {
  return plan.claims.every(
    (c) =>
      c.citations.length > 0 &&
      c.citations.every(
        (cit) =>
          cit.file.length > 0 &&
          Number.isFinite(cit.startLine) &&
          Number.isFinite(cit.endLine) &&
          cit.startLine >= 1 &&
          cit.endLine >= cit.startLine,
      ),
  );
}

interface ConclusionCase {
  name: string;
  build: () => ReturnType<typeof emptySnapshot>;
  assert: (result: ConclusionsResult) => void;
}

const cases: ConclusionCase[] = [
  {
    name: "pending plan → pending entry with progress-so-far, not omitted",
    build: pendingPlanSnapshot,
    assert: (result) => {
      expect(result.plans.length).toBeGreaterThanOrEqual(1);
      const plan = result.plans.find((p) => p.id === "new-feature");
      expect(plan).toBeDefined();
      expect(plan!.status).toBe("pending");
      expect(plan!.progressSoFar).toMatch(/0 \/ 4/);
      expect(plan!.progress.pending).toBe(4);
      expect(plan!.claims.length).toBeGreaterThan(0);
      expect(everyClaimHasCitation(plan!)).toBe(true);
    },
  },
  {
    name: "completed plan → claims each carrying file+line citations",
    build: completedPlanSnapshot,
    assert: (result) => {
      const plan = result.plans.find((p) => p.id === "done-plan");
      expect(plan).toBeDefined();
      expect(plan!.status).toBe("completed");
      expect(plan!.claims.length).toBeGreaterThan(0);
      expect(everyClaimHasCitation(plan!)).toBe(true);

      // objective claim
      expect(plan!.claims.some((c) => c.text.includes("refactor"))).toBe(true);

      const spec = result.plans.find((p) => p.id === "done-plan-spec");
      expect(spec).toBeDefined();
      const tldr = spec!.claims.find((c) =>
        c.text.includes("Refactor is complete"),
      );
      expect(tldr).toBeDefined();
      expect(tldr!.citations[0]).toEqual({
        file: "specs/done-plan.md",
        startLine: 10,
        endLine: 12,
      });
    },
  },
  {
    name: "empty snapshot → zero plans, no NaN progress",
    build: emptySnapshot,
    assert: (result) => {
      expect(result.plans).toEqual([]);
      expect(result.claimCount).toBe(0);
    },
  },
];

describe("computeConclusions", () => {
  it.each(cases)("$name", ({ build, assert }) => {
    assert(computeConclusions(build()));
  });

  it("is deterministic: same input twice → deep equal", () => {
    const snap = completedPlanSnapshot();
    expect(computeConclusions(snap)).toEqual(computeConclusions(snap));
  });

  it("every claim across fixtures has citations when claims exist", () => {
    for (const build of [pendingPlanSnapshot, completedPlanSnapshot]) {
      const result = computeConclusions(build());
      for (const plan of result.plans) {
        if (plan.claims.length === 0) continue;
        expect(everyClaimHasCitation(plan)).toBe(true);
      }
    }
  });
});

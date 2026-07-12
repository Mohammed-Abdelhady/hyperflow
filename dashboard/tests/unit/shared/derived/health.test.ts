import { describe, expect, it } from "vitest";
import {
  HEALTH_WEIGHT_GATE_PASS,
  HEALTH_WEIGHT_NON_FAILURE,
  HEALTH_WEIGHT_PARSE_SUCCESS,
  HEALTH_WEIGHT_STALENESS,
  computeFlowHealth,
  healthBandForScore,
  type FlowHealthResult,
} from "../../../../src/shared/derived/index.js";
import {
  emptySnapshot,
  fullyUnparseableSnapshot,
  healthyPartialParseSnapshot,
} from "./fixture.js";

interface HealthCase {
  name: string;
  now: number;
  build: (now: number) => ReturnType<typeof emptySnapshot>;
  assert: (result: FlowHealthResult) => void;
}

const cases: HealthCase[] = [
  {
    name: "3/4 parsed, all gates PASS, zero failures, fresh → exact composite",
    now: 1_700_000_000_000,
    build: healthyPartialParseSnapshot,
    assert: (result) => {
      // parses: 3 ok tasks + 1 fail task + 1 ok audit + 1 ok background = 6
      // parseSuccessRate = 5/6
      expect(result.factors.parseSuccessRate).toBeCloseTo(5 / 6, 10);
      // 1 audit PASS gate
      expect(result.factors.gatePassRate).toBe(1);
      // failures: 1 parse fail + 0 critical/important; denom = ops.total(1 praise) + 6 parses
      // failureNumer = 0 + 1 = 1; failureDenom = 1 + 6 = 7; nonFailure = 1 - 1/7
      expect(result.factors.nonFailureRate).toBeCloseTo(1 - 1 / 7, 10);
      // freshest mtime is now-5000 → nearly 1
      expect(result.factors.stalenessDecay).toBeGreaterThan(0.99);

      const expected =
        (5 / 6) * HEALTH_WEIGHT_PARSE_SUCCESS +
        1 * HEALTH_WEIGHT_GATE_PASS +
        (1 - 1 / 7) * HEALTH_WEIGHT_NON_FAILURE +
        result.factors.stalenessDecay * HEALTH_WEIGHT_STALENESS;
      expect(result.score).toBe(Math.round(expected * 100));
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.parseFailures).toHaveLength(1);
      expect(result.parseFailures[0]?.path).toBe("tasks/d.md");
      expect(Number.isNaN(result.score)).toBe(false);
    },
  },
  {
    name: "fully unparseable → degraded score still in [0,100]",
    now: 1_700_000_000_000,
    build: () => fullyUnparseableSnapshot(),
    assert: (result) => {
      expect(result.factors.parseSuccessRate).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isNaN(result.score)).toBe(false);
      expect(result.parseFailures.length).toBeGreaterThan(0);
      expect(["degraded", "critical", "watch"]).toContain(result.band);
    },
  },
  {
    name: "empty snapshot → finite score, no NaN",
    now: 1_700_000_000_000,
    build: () => emptySnapshot(),
    assert: (result) => {
      expect(Number.isFinite(result.score)).toBe(true);
      expect(Number.isNaN(result.score)).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      // vacuous rates → 1
      expect(result.factors.parseSuccessRate).toBe(1);
      expect(result.factors.gatePassRate).toBe(1);
      expect(result.factors.nonFailureRate).toBe(1);
      expect(result.factors.stalenessDecay).toBe(1);
      expect(result.score).toBe(100);
      expect(result.band).toBe("healthy");
    },
  },
];

describe("computeFlowHealth", () => {
  it.each(cases)("$name", ({ now, build, assert }) => {
    const result = computeFlowHealth(build(now), now);
    assert(result);
  });

  it("is deterministic: same input twice → deep equal", () => {
    const now = 1_700_000_000_000;
    const snap = healthyPartialParseSnapshot(now);
    const a = computeFlowHealth(snap, now);
    const b = computeFlowHealth(snap, now);
    expect(a).toEqual(b);
  });

  it("accepts Date instance as now", () => {
    const now = 1_700_000_000_000;
    const snap = emptySnapshot();
    const fromNum = computeFlowHealth(snap, now);
    const fromDate = computeFlowHealth(snap, new Date(now));
    expect(fromNum).toEqual(fromDate);
  });

  it("maps score bands via named thresholds", () => {
    expect(healthBandForScore(100)).toBe("healthy");
    expect(healthBandForScore(80)).toBe("healthy");
    expect(healthBandForScore(79)).toBe("watch");
    expect(healthBandForScore(50)).toBe("watch");
    expect(healthBandForScore(49)).toBe("degraded");
    expect(healthBandForScore(25)).toBe("degraded");
    expect(healthBandForScore(24)).toBe("critical");
    expect(healthBandForScore(0)).toBe("critical");
  });

  it("exports weights that sum to 1", () => {
    const sum =
      HEALTH_WEIGHT_PARSE_SUCCESS +
      HEALTH_WEIGHT_GATE_PASS +
      HEALTH_WEIGHT_NON_FAILURE +
      HEALTH_WEIGHT_STALENESS;
    expect(sum).toBeCloseTo(1, 10);
  });
});

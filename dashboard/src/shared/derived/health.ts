import type {
  AuditNode,
  BackgroundAgent,
  BackgroundRegistry,
  FeatureNode,
  FeaturePhase,
  HandoffPackage,
  Snapshot,
} from "@shared/schemas/index.js";
import {
  HEALTH_BAND_DEGRADED_MIN,
  HEALTH_BAND_HEALTHY_MIN,
  HEALTH_BAND_WATCH_MIN,
  HEALTH_SCORE_MAX,
  HEALTH_SCORE_MIN,
  HEALTH_WEIGHT_GATE_PASS,
  HEALTH_WEIGHT_NON_FAILURE,
  HEALTH_WEIGHT_PARSE_SUCCESS,
  HEALTH_WEIGHT_STALENESS,
  STALENESS_FULL_DECAY_MS,
} from "./constants.js";
import {
  clamp01,
  collectAllParses,
  isRawEntry,
  ratioOrOne,
} from "./parse-nodes.js";

export type HealthBand = "healthy" | "watch" | "degraded" | "critical";

export interface HealthFactorBreakdown {
  parseSuccessRate: number;
  gatePassRate: number;
  nonFailureRate: number;
  stalenessDecay: number;
  weights: {
    parseSuccess: number;
    gatePass: number;
    nonFailure: number;
    staleness: number;
  };
}

export interface ParseFailureRef {
  path: string;
  reason?: string;
}

export interface FlowHealthResult {
  score: number;
  factors: HealthFactorBreakdown;
  band: HealthBand;
  parseFailures: ParseFailureRef[];
}

function verdictPasses(verdict: string | undefined): boolean | null {
  if (!verdict) return null;
  const v = verdict.trim().toUpperCase();
  if (v === "PASS" || v === "SHIP" || v === "OK" || v === "APPROVED") return true;
  if (v === "FAIL" || v === "NEEDS_FIX" || v === "BLOCKED" || v === "REJECTED") {
    return false;
  }
  return null;
}

function collectGates(snapshot: Snapshot): { passed: boolean }[] {
  const gates: { passed: boolean }[] = [];

  for (const audit of snapshot.audits) {
    if (isRawEntry(audit)) continue;
    const pass = verdictPasses((audit as AuditNode).verdict);
    if (pass !== null) gates.push({ passed: pass });
  }

  for (const pkg of snapshot.handoff) {
    if (isRawEntry(pkg)) continue;
    const h = pkg as HandoffPackage;
    if (h.status === "built" || h.status === "reviewed") {
      gates.push({ passed: true });
    }
    if (h.completion.result === "built") gates.push({ passed: true });
    if (h.completion.result === "partial") gates.push({ passed: false });
  }

  for (const feature of snapshot.features) {
    if (isRawEntry(feature)) continue;
    for (const phase of (feature as FeatureNode).phases) {
      if (isRawEntry(phase)) continue;
      for (const criterion of (phase as FeaturePhase).exitCriteria) {
        gates.push({ passed: criterion.state === "done" });
      }
    }
  }

  return gates;
}

function countOperationalFailures(snapshot: Snapshot): {
  failures: number;
  total: number;
} {
  let failures = 0;
  let total = 0;

  if (!isRawEntry(snapshot.background)) {
    const reg = snapshot.background as BackgroundRegistry;
    for (const agent of reg.agents) {
      if (isRawEntry(agent) || ("raw" in agent && agent.raw === true)) {
        failures += 1;
        total += 1;
        continue;
      }
      const a = agent as BackgroundAgent;
      total += 1;
      if (
        a.statusClass === "errored" ||
        a.statusClass === "stalled" ||
        a.statusClass === "cancelled"
      ) {
        failures += 1;
      }
    }
  }

  for (const audit of snapshot.audits) {
    if (isRawEntry(audit)) continue;
    const a = audit as AuditNode;
    total +=
      a.rollup.Critical +
      a.rollup.Important +
      a.rollup.Suggestion +
      a.rollup.Praise;
    failures += a.rollup.Critical + a.rollup.Important;
  }

  return { failures, total };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return HEALTH_SCORE_MIN;
  if (n < HEALTH_SCORE_MIN) return HEALTH_SCORE_MIN;
  if (n > HEALTH_SCORE_MAX) return HEALTH_SCORE_MAX;
  return Math.round(n);
}

function toEpochMs(now: Date | number): number {
  return typeof now === "number" ? now : now.getTime();
}

function stalenessDecay(mtimes: number[], nowMs: number): number {
  if (mtimes.length === 0) return 1;
  const newest = Math.max(...mtimes);
  const age = Math.max(0, nowMs - newest);
  if (STALENESS_FULL_DECAY_MS <= 0) return 1;
  return clamp01(1 - age / STALENESS_FULL_DECAY_MS);
}

export function healthBandForScore(score: number): HealthBand {
  if (score >= HEALTH_BAND_HEALTHY_MIN) return "healthy";
  if (score >= HEALTH_BAND_WATCH_MIN) return "watch";
  if (score >= HEALTH_BAND_DEGRADED_MIN) return "degraded";
  return "critical";
}

/**
 * Flow Health 0–100 composite over a snapshot.
 * Pure: `now` is injected; no Date.now(), no I/O.
 */
export function computeFlowHealth(
  snapshot: Snapshot,
  now: Date | number,
): FlowHealthResult {
  const parses = collectAllParses(snapshot);
  const okCount = parses.filter((p) => p.ok).length;
  const parseSuccessRate = ratioOrOne(okCount, parses.length);

  const gates = collectGates(snapshot);
  const gatePassRate = ratioOrOne(
    gates.filter((g) => g.passed).length,
    gates.length,
  );

  const parseFailCount = parses.length - okCount;
  const ops = countOperationalFailures(snapshot);
  const failureRatio = ratioOrOne(
    ops.failures + parseFailCount,
    ops.total + parses.length,
  );
  const nonFailureRate = clamp01(1 - failureRatio);

  const mtimes = parses
    .map((p) => p.mtimeMs)
    .filter((m): m is number => typeof m === "number" && Number.isFinite(m));
  const decay = stalenessDecay(mtimes, toEpochMs(now));

  const weighted =
    parseSuccessRate * HEALTH_WEIGHT_PARSE_SUCCESS +
    gatePassRate * HEALTH_WEIGHT_GATE_PASS +
    nonFailureRate * HEALTH_WEIGHT_NON_FAILURE +
    decay * HEALTH_WEIGHT_STALENESS;

  const score = clampScore(weighted * HEALTH_SCORE_MAX);

  const parseFailures: ParseFailureRef[] = parses
    .filter((p) => !p.ok)
    .map((p) => {
      const ref: ParseFailureRef = { path: p.path };
      if (p.reason !== undefined) ref.reason = p.reason;
      return ref;
    });

  return {
    score,
    factors: {
      parseSuccessRate,
      gatePassRate,
      nonFailureRate,
      stalenessDecay: decay,
      weights: {
        parseSuccess: HEALTH_WEIGHT_PARSE_SUCCESS,
        gatePass: HEALTH_WEIGHT_GATE_PASS,
        nonFailure: HEALTH_WEIGHT_NON_FAILURE,
        staleness: HEALTH_WEIGHT_STALENESS,
      },
    },
    band: healthBandForScore(score),
    parseFailures,
  };
}

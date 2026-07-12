/**
 * Named weights, thresholds, and decay constants for Flow Health.
 * No magic numbers in health.ts — all formula knobs live here.
 */

/** Contribution of parse-success rate to the composite score (0–1). */
export const HEALTH_WEIGHT_PARSE_SUCCESS = 0.3;

/** Contribution of gate-pass rate to the composite score (0–1). */
export const HEALTH_WEIGHT_GATE_PASS = 0.3;

/** Contribution of (1 − failure ratio) to the composite score (0–1). */
export const HEALTH_WEIGHT_NON_FAILURE = 0.2;

/** Contribution of staleness decay to the composite score (0–1). */
export const HEALTH_WEIGHT_STALENESS = 0.2;

/** Inclusive lower bound for the `healthy` band (0–100 score). */
export const HEALTH_BAND_HEALTHY_MIN = 80;

/** Inclusive lower bound for the `watch` band (0–100 score). */
export const HEALTH_BAND_WATCH_MIN = 50;

/** Inclusive lower bound for the `degraded` band (0–100 score). */
export const HEALTH_BAND_DEGRADED_MIN = 25;

/**
 * Age at which staleness decay reaches 0 (linear from 1 at age 0).
 * 7 days — long enough that active chains stay warm, short enough that
 * abandoned trees pull the dial down.
 */
export const STALENESS_FULL_DECAY_MS = 7 * 24 * 60 * 60 * 1000;

/** Score scale upper bound (Flow Health is reported on 0–100). */
export const HEALTH_SCORE_MAX = 100;

/** Score scale lower bound. */
export const HEALTH_SCORE_MIN = 0;

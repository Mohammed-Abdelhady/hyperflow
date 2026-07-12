/** Semantic state → CSS custom-property names (no conditionals at call sites). */

export type SemanticState =
  | "pass"
  | "fix"
  | "blocked"
  | "live"
  | "queued";

export interface StateTokenPair {
  color: string;
  dim: string;
  label: string;
}

export const STATE_TOKEN_MAP: Readonly<Record<SemanticState, StateTokenPair>> =
  {
    pass: {
      color: "var(--state-pass)",
      dim: "var(--state-pass-dim)",
      label: "PASS",
    },
    fix: {
      color: "var(--state-fix)",
      dim: "var(--state-fix-dim)",
      label: "NEEDS_FIX",
    },
    blocked: {
      color: "var(--state-blocked)",
      dim: "var(--state-blocked-dim)",
      label: "BLOCKED",
    },
    live: {
      color: "var(--state-live)",
      dim: "var(--state-live-dim)",
      label: "LIVE",
    },
    queued: {
      color: "var(--state-queued)",
      dim: "var(--state-queued-dim)",
      label: "QUEUED",
    },
  };

/** Verdict vocabulary → semantic state (StatusBadge). */
export const VERDICT_STATE_MAP: Readonly<Record<string, SemanticState>> = {
  PASS: "pass",
  NEEDS_FIX: "fix",
  BLOCKED: "blocked",
  SECURITY_VIOLATION: "blocked",
  LIVE: "live",
  QUEUED: "queued",
  SHIP: "pass",
  FAIL: "blocked",
};

/** Heatmap intensity 0–4 → accent alpha ramp (system.md). */
export const HEATMAP_INTENSITY_RAMP: readonly string[] = [
  "rgb(20 184 166 / 0.08)",
  "rgb(20 184 166 / 0.2)",
  "rgb(20 184 166 / 0.4)",
  "rgb(20 184 166 / 0.65)",
  "rgb(20 184 166 / 1)",
] as const;

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

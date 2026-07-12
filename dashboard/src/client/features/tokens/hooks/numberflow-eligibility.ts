/** NumberFlow tween eligibility — snap when updates are faster than duration. */

export const NUMERAL_ANIM_MS = 450;

export type NumeralMode = "tween" | "snap";

export interface EligibilityInput {
  /** Milliseconds since previous update for this value. */
  intervalMs: number;
  /** Global scrubbing flag zeros all tweens. */
  scrubbing: boolean;
  /** Class of value: live counters always snap; batch totals may tween. */
  kind: "live-counter" | "batch-total" | "health-score";
  reducedMotion: boolean;
}

/**
 * Pure classifier — unit-tested.
 * Live counters always snap. While scrubbing / reduced-motion: snap.
 * If update interval < animation duration: snap. Else tween for batch/health.
 */
export function numeralMode(input: EligibilityInput): NumeralMode {
  if (input.scrubbing || input.reducedMotion) return "snap";
  if (input.kind === "live-counter") return "snap";
  if (input.intervalMs < NUMERAL_ANIM_MS) return "snap";
  return "tween";
}

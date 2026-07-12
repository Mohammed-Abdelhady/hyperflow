import { describe, expect, it } from "vitest";
import {
  numeralMode,
  NUMERAL_ANIM_MS,
} from "../../../../src/client/features/tokens/hooks/numberflow-eligibility";

describe("numeralMode", () => {
  it("snaps live counters", () => {
    expect(
      numeralMode({
        intervalMs: 5000,
        scrubbing: false,
        kind: "live-counter",
        reducedMotion: false,
      }),
    ).toBe("snap");
  });

  it("snaps when interval < animation duration", () => {
    expect(
      numeralMode({
        intervalMs: 200,
        scrubbing: false,
        kind: "batch-total",
        reducedMotion: false,
      }),
    ).toBe("snap");
  });

  it("tweens batch totals with slow updates", () => {
    expect(
      numeralMode({
        intervalMs: NUMERAL_ANIM_MS + 50,
        scrubbing: false,
        kind: "batch-total",
        reducedMotion: false,
      }),
    ).toBe("tween");
  });

  it("snaps while scrubbing", () => {
    expect(
      numeralMode({
        intervalMs: 5000,
        scrubbing: true,
        kind: "health-score",
        reducedMotion: false,
      }),
    ).toBe("snap");
  });
});

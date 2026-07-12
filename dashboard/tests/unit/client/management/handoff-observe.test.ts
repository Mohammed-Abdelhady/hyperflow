import { describe, expect, it } from "vitest";
import {
  HANDOFF_NEXT,
  legalNext,
} from "../../../../src/client/features/management/handoff/useHandoffMutations";
import { OBSERVE_MODE_TOOLTIP } from "../../../../src/client/features/management/hooks/useObserveMode";

describe("handoff legalNext", () => {
  it("offers exactly one forward transition per STATUS", () => {
    expect(legalNext("planned")).toBe("built");
    expect(legalNext("built")).toBe("reviewed");
    expect(legalNext("reviewed")).toBeNull();
    expect(legalNext("unknown")).toBeNull();
  });

  it("never allows skipping or reversing", () => {
    expect(HANDOFF_NEXT.planned).not.toBe("reviewed");
    expect(HANDOFF_NEXT.built).not.toBe("planned");
    expect(HANDOFF_NEXT.reviewed).toBeNull();
  });
});

describe("observe mode copy", () => {
  it("exports keyboard-reachable tooltip copy", () => {
    expect(OBSERVE_MODE_TOOLTIP.toLowerCase()).toContain("observe");
    expect(OBSERVE_MODE_TOOLTIP.toLowerCase()).toContain("read-only");
  });
});

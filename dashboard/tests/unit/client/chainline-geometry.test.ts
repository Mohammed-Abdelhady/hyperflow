import { describe, expect, it } from "vitest";
import {
  liveFillScale,
  nearestBoundaryIndex,
  pointerToProgress,
  stepDeltaFromKey,
} from "../../../src/client/utils/chainline-geometry";

describe("chainline geometry", () => {
  it("computes live fill scale", () => {
    const stages = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    expect(liveFillScale(stages, 0)).toBeCloseTo(1 / 3);
    expect(liveFillScale(stages, 2)).toBe(1);
  });

  it("maps pointer 1:1 in LTR and RTL", () => {
    const rect = { left: 100, width: 200 };
    expect(pointerToProgress(100, rect, false)).toBe(0);
    expect(pointerToProgress(200, rect, false)).toBe(0.5);
    expect(pointerToProgress(100, rect, true)).toBe(1);
    expect(pointerToProgress(200, rect, true)).toBe(0.5);
  });

  it("snaps to nearest event boundary", () => {
    expect(nearestBoundaryIndex(0.51, 5)).toBe(2);
  });

  it("mirrors arrow keys under RTL", () => {
    expect(stepDeltaFromKey("ArrowRight", false)).toBe(1);
    expect(stepDeltaFromKey("ArrowRight", true)).toBe(-1);
  });
});

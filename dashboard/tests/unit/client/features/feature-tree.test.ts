import { describe, expect, it } from "vitest";
import type {
  FeaturePhase,
  FeaturePhaseEntry,
} from "../../../../src/shared/schemas/index.js";
import {
  decodeDrill,
  encodeDrill,
} from "../../../../src/client/features/features/hooks/useDrillState";
import {
  formatDeps,
  orderPhases,
  progressPercent,
} from "../../../../src/client/features/features/utils/feature-tree";
import { okHealth } from "../../shared/derived/fixture-base";

function phase(index: number, name: string): FeaturePhase {
  return {
    path: `features/x/phase-${index}-${name}/phase.md`,
    folder: `phase-${index}-${name}`,
    index,
    name,
    dependsOn: [],
    tasks: [],
    exitCriteria: [],
    parseHealth: okHealth,
    progress: { done: index, running: 0, pending: 2, total: 2 + index },
  };
}

describe("feature-tree", () => {
  it("orders phases by phase-<n> index", () => {
    const unordered: FeaturePhaseEntry[] = [
      phase(2, "b"),
      phase(0, "a"),
      phase(1, "c"),
    ];
    const ordered = orderPhases(unordered);
    expect(ordered.map((p) => (p as FeaturePhase).index)).toEqual([0, 1, 2]);
  });

  it("rolls up progress without division-by-zero on empty tasks", () => {
    expect(progressPercent({ done: 0, running: 0, pending: 0, total: 0 })).toBe(
      0,
    );
    expect(progressPercent({ done: 1, running: 0, pending: 1, total: 2 })).toBe(
      50,
    );
    expect(progressPercent(undefined)).toBe(0);
  });

  it("formats dep references as plain text", () => {
    expect(formatDeps([])).toBe("—");
    expect(formatDeps(["T1", "T2"])).toBe("T1, T2");
  });
});

describe("useDrillState encode/decode", () => {
  it("round-trips every drill position through URL params", () => {
    const positions = [
      { feature: "dash", phase: null, task: null },
      { feature: "dash", phase: "phase-1-x", task: null },
      { feature: "dash", phase: "phase-1-x", task: "T29" },
    ];
    for (const pos of positions) {
      expect(decodeDrill(encodeDrill(pos))).toEqual(pos);
    }
  });
});

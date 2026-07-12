import { describe, expect, it } from "vitest";
import type { AuditNode } from "../../../../src/shared/schemas/index.js";
import { buildHeatmapModel } from "../../../../src/client/features/audits/hooks/useHeatmapModel";
import {
  normalizeSeverity,
  severityRank,
  SEVERITY_STATE,
} from "../../../../src/client/features/audits/utils/severity";
import { okHealth } from "../../shared/derived/fixture-base";

function audit(
  slug: string,
  rollup: AuditNode["rollup"],
): AuditNode {
  return {
    path: `audits/${slug}.md`,
    slug,
    findings: [],
    rollup,
    parseHealth: okHealth,
  };
}

describe("severity", () => {
  it("maps known severities to state tokens", () => {
    expect(SEVERITY_STATE[normalizeSeverity("Critical")]).toBe("blocked");
    expect(SEVERITY_STATE[normalizeSeverity("Praise")]).toBe("pass");
  });

  it("degrades unknown severity without throwing", () => {
    expect(normalizeSeverity("wat")).toBe("unknown");
    expect(severityRank("wat")).toBeGreaterThanOrEqual(0);
  });
});

describe("buildHeatmapModel", () => {
  it("flags single-audit case with trend note", () => {
    const model = buildHeatmapModel([
      audit("a1", {
        Critical: 2,
        Important: 1,
        Suggestion: 0,
        Praise: 0,
      }),
    ]);
    expect(model.singleAudit).toBe(true);
    expect(model.cells).toHaveLength(1);
    expect(model.note).toMatch(/second audit/i);
  });

  it("maps multi-audit counts to 5-step intensity ramp", () => {
    const model = buildHeatmapModel([
      audit("low", {
        Critical: 0,
        Important: 0,
        Suggestion: 1,
        Praise: 0,
      }),
      audit("high", {
        Critical: 10,
        Important: 5,
        Suggestion: 0,
        Praise: 0,
      }),
    ]);
    expect(model.singleAudit).toBe(false);
    expect(model.cells).toHaveLength(2);
    const high = model.cells.find((c) => c.auditSlug === "high");
    const low = model.cells.find((c) => c.auditSlug === "low");
    expect(high?.intensity).toBe(4);
    expect(low?.intensity).toBeLessThan(high?.intensity ?? 0);
  });
});

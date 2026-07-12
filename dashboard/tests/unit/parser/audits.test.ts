import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAudit } from "../../../src/server/parser/audits.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/audits");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseAudit", () => {
  it("parses needs-fix L3 with full rollup", () => {
    const result = parseAudit({
      path: "audits/needs-fix-l3.md",
      raw: load("needs-fix-l3.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.verdict).toContain("NEEDS_FIX");
    expect(result.findings).toHaveLength(13);
    expect(result.rollup).toEqual({
      Critical: 0,
      Important: 4,
      Suggestion: 4,
      Praise: 5,
    });
    const first = result.findings[0];
    expect(first?.severity).toBe("Important");
    expect(first?.file).toBe("config/features.json");
    expect(first?.line).toBe(128);
    expect(first?.issue).toBeTruthy();
    expect(first?.fix).toBeTruthy();
    expect(first?.why).toBeTruthy();
  });

  it("handles all severities and optional line", () => {
    const result = parseAudit({
      path: "audits/all-severities.md",
      raw: load("all-severities.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.findings).toHaveLength(4);
    expect(result.rollup.Critical).toBe(1);
    const noLine = result.findings.find((f) => f.file === "config/features.json");
    expect(noLine?.line).toBeUndefined();
  });

  it("records diagnostic on findings count mismatch", () => {
    const result = parseAudit({
      path: "audits/count-mismatch.md",
      raw: load("count-mismatch.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.rollup.Important).toBe(3);
    expect(
      result.parseHealth.diagnostics.some(
        (d) => d.code === "findings-count-mismatch",
      ),
    ).toBe(true);
  });

  it("degrades unknown severity finding to raw", () => {
    const result = parseAudit({
      path: "audits/unknown-severity.md",
      raw: load("unknown-severity.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    const unknown = result.findings.find((f) => f.severity === "unknown");
    expect(unknown?.raw).toBe(true);
    expect(result.rollup.Important).toBe(1);
  });

  it("parses keyline status audit", () => {
    const result = parseAudit({
      path: "audits/keyline-status-audit.md",
      raw: load("keyline-status-audit.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.verdict).toContain("NEEDS_FIX");
    expect(result.findings).toHaveLength(1);
  });

  it("never throws on garbage", () => {
    expect(() =>
      parseAudit({ path: "a.md", raw: "\x00" }),
    ).not.toThrow();
  });
});

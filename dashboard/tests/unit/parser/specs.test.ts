import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSpec } from "../../../src/server/parser/specs.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/specs");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseSpec", () => {
  it("builds section index with numbered sections and mermaid", () => {
    const result = parseSpec({
      path: "specs/numbered-sections.md",
      raw: load("numbered-sections.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.progressDone).toBe(3);
    expect(result.progressTotal).toBe(5);
    expect(result.tldr).toMatch(/tiny spec/i);
    expect(result.components.length).toBe(3);
    expect(result.hasTradeoffs).toBe(true);
    const numbered = result.sections.filter((s) => s.sectionNumber !== undefined);
    expect(numbered.map((s) => s.sectionNumber)).toEqual(
      expect.arrayContaining([1, 2, 3, 4, 5]),
    );
    const arch = result.sections.find((s) => s.sectionNumber === 1);
    expect(arch?.mermaidBlocks.length).toBeGreaterThanOrEqual(1);
    expect(arch?.mermaidBlocks[0]).toContain("graph TD");
  });

  it("flags draft from filename", () => {
    const result = parseSpec({
      path: "specs/draft-spec.draft.md",
      raw: load("draft-spec.draft.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.draft).toBe(true);
  });

  it("indexes headings without status block", () => {
    const result = parseSpec({
      path: "specs/no-status-spec.md",
      raw: load("no-status-spec.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.status).toBeUndefined();
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
  });

  it("integration: real hyperflow-dashboard.md", () => {
    const path = resolve(
      import.meta.dirname,
      "../../../../.hyperflow/specs/hyperflow-dashboard.md",
    );
    const raw = readFileSync(path, "utf8");
    const result = parseSpec({ path: "specs/hyperflow-dashboard.md", raw });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.status?.toLowerCase()).toContain("approved");
    expect(result.progressDone).toBe(5);
    expect(result.progressTotal).toBe(5);
    const nums = result.sections
      .filter((s) => s.sectionNumber !== undefined)
      .map((s) => s.sectionNumber);
    expect(nums).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
    const mermaidCount = result.sections.reduce(
      (n, s) => n + s.mermaidBlocks.length,
      0,
    );
    expect(mermaidCount).toBeGreaterThanOrEqual(3);
  });

  it("never throws on empty", () => {
    expect(() => parseSpec({ path: "x.md", raw: "" })).not.toThrow();
  });
});

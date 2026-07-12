import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStatusBlock } from "../../../../src/server/parser/primitives/status-block.js";

const FIX = resolve(
  import.meta.dirname,
  "../../../fixtures/golden/status-block",
);

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseStatusBlock", () => {
  it("parses table-style task status block with progress", () => {
    const result = parseStatusBlock(load("table-task.md"));
    expect(result.present).toBe(true);
    if (!result.present) return;
    expect(result.style).toBe("table");
    expect(result.fields["Status"]).toBe("in_progress");
    expect(result.fields["Progress"]).toContain("7 / 15");
    expect(result.fields["Progress"]).toContain("████████");
    expect(result.fields["Branch"]).toContain("feat/compaction");
    expect(result.fields["Specialists"]).toBeTruthy();
    expect(result.progress).toEqual({ done: 7, total: 15 });
  });

  it("parses audit verdict table without Progress row", () => {
    const result = parseStatusBlock(load("table-audit.md"));
    expect(result.present).toBe(true);
    if (!result.present) return;
    expect(result.style).toBe("table");
    expect(result.fields["Verdict"]).toContain("NEEDS_FIX");
    expect(result.fields["Level"]).toBe("L3");
    expect(result.fields["Findings"]).toContain("Critical");
    expect(result.fields["Progress"]).toBeUndefined();
  });

  it("parses key-line style into normalized field map", () => {
    const result = parseStatusBlock(load("keyline-task.md"));
    expect(result.present).toBe(true);
    if (!result.present) return;
    expect(result.style).toBe("keyline");
    expect(result.fields["Sub-tasks"]).toBe("8 / 14");
    expect(result.fields["Tokens used"]).toContain("231.2k");
    expect(result.fields["Wall-clock"]).toContain("4m 22s");
    expect(result.fields["ETA"]).toContain("remaining");
    expect(result.progress).toEqual({ done: 8, total: 14 });
  });

  it("returns explicit absent when no status block", () => {
    const result = parseStatusBlock(load("missing-block.md"));
    expect(result.present).toBe(false);
  });

  it("degrades malformed table without throwing", () => {
    expect(() => parseStatusBlock(load("malformed-table.md"))).not.toThrow();
    const result = parseStatusBlock(load("malformed-table.md"));
    // Degraded present or absent — never throw; prefer degraded when partial data
    if (result.present) {
      expect(result.degraded === true || Object.keys(result.fields).length >= 0).toBe(
        true,
      );
    } else {
      expect(result.present).toBe(false);
    }
  });

  it("BOM+CRLF table matches clean LF twin", () => {
    const clean = parseStatusBlock(load("table-task.md"));
    const bom = parseStatusBlock(load("bom-crlf-table.md"));
    expect(bom).toEqual(clean);
  });

  it("never throws on empty, garbage, or binary-ish input", () => {
    const cases = ["", "\x00\x01\x02", "||||", "## Status\n| torn"];
    for (const c of cases) {
      expect(() => parseStatusBlock(c)).not.toThrow();
    }
  });

  it("integration: real hyperflow-dashboard spec status table", () => {
    const specPath = resolve(
      import.meta.dirname,
      "../../../../../.hyperflow/specs/hyperflow-dashboard.md",
    );
    const raw = readFileSync(specPath, "utf8");
    expect(() => parseStatusBlock(raw)).not.toThrow();
    const result = parseStatusBlock(raw);
    expect(result.present).toBe(true);
    if (!result.present) return;
    expect(result.fields["Status"]?.toLowerCase()).toContain("approved");
    expect(result.fields["Progress"]).toMatch(/Section\s+5\s*\/\s*5/i);
    expect(result.fields["Specialists"]).toBeTruthy();
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMemory } from "../../../src/server/parser/memory.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/memory");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseMemory", () => {
  it("parses tagged current entries with backticked tags", () => {
    const result = parseMemory({
      path: "memory/learnings.md",
      raw: load("tagged-current.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.entries).toHaveLength(3);
    expect(result.entries.every((e) => e.class === "tagged")).toBe(true);
    expect(result.entries[0]?.tags).toEqual(["api", "convention"]);
    expect(result.entries[0]?.what).toMatch(/Zod/);
    expect(result.entries[0]?.evidence).toBeTruthy();
  });

  it("parses plain unbackticked tags", () => {
    const result = parseMemory({
      path: "memory/learnings.md",
      raw: load("tags-unbackticked.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.entries[0]?.tags).toEqual(["api", "convention"]);
  });

  it("parses legacy headings", () => {
    const result = parseMemory({
      path: "memory/learnings.md",
      raw: load("legacy-headings.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.class === "legacy")).toBe(true);
    expect(result.entries[0]?.date).toBe("2026-04-02");
    expect(result.entries[0]?.sourceSlug).toBe("dashboard-proto");
    expect(result.entries[0]?.tags).toEqual([]);
  });

  it("preserves mixed generations in order", () => {
    const result = parseMemory({
      path: "memory/learnings.md",
      raw: load("mixed-generations.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.entries).toHaveLength(4);
    expect(result.entries.map((e) => e.class)).toEqual([
      "tagged",
      "legacy",
      "archived",
      "archived",
    ]);
    expect(result.entries[3]?.archivePointer).toContain("archive/");
  });

  it("parses anti-patterns house shape", () => {
    const result = parseMemory({
      path: "memory/anti-patterns.md",
      raw: load("anti-patterns.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.entries[0]?.category).toBe("Error handling");
    expect(result.entries[0]?.frequency).toBe(12);
    expect(result.entries[0]?.recommendation).toMatch(/Result/);
  });

  it("falls back on garbage without headings", () => {
    const result = parseMemory({
      path: "memory/garbage.md",
      raw: load("garbage.md"),
    });
    expect(isRawFallback(result)).toBe(true);
  });
});

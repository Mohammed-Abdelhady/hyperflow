import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractRosterItems,
  parseDetailLine,
  parseRosterLabel,
  scanCheckboxes,
} from "../../../../src/server/parser/primitives/checkboxes.js";

const FIX = resolve(
  import.meta.dirname,
  "../../../fixtures/golden/status-block",
);

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("scanCheckboxes", () => {
  it("counts done, running, pending including [~]", () => {
    const result = scanCheckboxes(load("checkboxes-mixed.md"));
    expect(result.counts.done).toBe(1);
    expect(result.counts.running).toBe(1);
    expect(result.counts.pending).toBe(1);
    expect(result.counts.total).toBe(3);
  });

  it("groups by H2 section", () => {
    const result = scanCheckboxes(load("checkboxes-mixed.md"));
    const sub = result.sections.find((s) => s.heading === "Sub-tasks");
    expect(sub).toBeDefined();
    expect(sub?.counts.total).toBe(3);
  });
});

describe("parseRosterLabel + detail", () => {
  it("splits roster line into taskId, role, title", () => {
    const parts = parseRosterLabel(
      "T1 — Writer · Author compaction protocol reference",
    );
    expect(parts.taskId).toBe("T1");
    expect(parts.role).toBe("Writer");
    expect(parts.title).toBe("Author compaction protocol reference");
  });

  it("returns plain title for non-roster labels", () => {
    const parts = parseRosterLabel("Define JWT payload types");
    expect(parts.taskId).toBeUndefined();
    expect(parts.title).toBe("Define JWT payload types");
  });

  it("parses detail line segments", () => {
    const detail = parseDetailLine(
      "Read: spec, cache/SKILL.md · Create: skills/cache/references/compaction.md · Complexity: medium · Specialist: searcher · Brief: slug/T1.md",
    );
    expect(detail.read).toEqual(["spec", "cache/SKILL.md"]);
    expect(detail.create).toEqual([
      "skills/cache/references/compaction.md",
    ]);
    expect(detail.complexity).toBe("medium");
    expect(detail.specialist).toBe("searcher");
    expect(detail.brief).toBe("slug/T1.md");
  });

  it("extracts roster items with detail from fixture", () => {
    const items = extractRosterItems(load("checkboxes-mixed.md"));
    expect(items).toHaveLength(3);
    expect(items[0]?.taskId).toBe("T1");
    expect(items[0]?.state).toBe("done");
    expect(items[0]?.detail?.specialist).toBe("searcher");
    expect(items[1]?.state).toBe("running");
    expect(items[2]?.state).toBe("pending");
  });

  it("never throws on garbage", () => {
    expect(() => scanCheckboxes("")).not.toThrow();
    expect(() => extractRosterItems("\x00")).not.toThrow();
  });
});

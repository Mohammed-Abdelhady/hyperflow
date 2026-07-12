import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTask } from "../../../src/server/parser/tasks.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/tasks");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseTask", () => {
  it("parses frontmatter shape", () => {
    const result = parseTask({
      path: "tasks/frontmatter-full.md",
      raw: load("frontmatter-full.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.format).toBe("frontmatter");
    expect(result.status).toBe("in-progress");
    expect(result.progress.done).toBe(2);
    expect(result.progress.pending).toBe(4);
    expect(result.progress.total).toBe(6);
    expect(result.subTasks.length).toBe(6);
  });

  it("parses roster table status with detail lines", () => {
    const result = parseTask({
      path: "tasks/roster-table-status.md",
      raw: load("roster-table-status.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.format).toBe("roster");
    expect(result.status).toBe("in_progress");
    expect(result.subTasks[0]?.taskId).toBe("T1");
    expect(result.subTasks[0]?.detail?.specialist).toBe("searcher");
    expect(result.subTasks[0]?.detail?.brief).toBe("slug/T1.md");
    expect(result.estimatedCost?.rows.length).toBeGreaterThan(0);
    expect(result.executionPlanRaw).toBeTruthy();
  });

  it("parses roster keyline status with running marker", () => {
    const result = parseTask({
      path: "tasks/roster-keyline-status.md",
      raw: load("roster-keyline-status.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.format).toBe("roster");
    expect(result.parseHealth.format).toBe("roster-keyline");
    expect(result.progress.done).toBe(1);
    expect(result.progress.running).toBe(1);
    expect(result.progress.pending).toBe(1);
    expect(result.subTasks.find((s) => s.state === "running")?.taskId).toBe(
      "T2",
    );
  });

  it("derives counts from checkboxes when no status/frontmatter", () => {
    const result = parseTask({
      path: "tasks/no-status-checkboxes-only.md",
      raw: load("no-status-checkboxes-only.md"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.format).toBe("derived");
    expect(result.parseHealth.state).toBe("derived");
    expect(result.progress.done).toBe(2);
    expect(result.progress.running).toBe(1);
    expect(result.progress.pending).toBe(1);
    expect(result.progress.total).toBe(4);
  });

  it("returns fallback on torn mid-write", () => {
    const result = parseTask({
      path: "tasks/torn-mid-write.md",
      raw: load("torn-mid-write.md"),
    });
    expect(isRawFallback(result)).toBe(true);
    if (!isRawFallback(result)) return;
    expect(result.parseError).toBe(true);
    expect(result.raw.length).toBeGreaterThan(0);
  });

  it("BOM+CRLF roster matches clean twin", () => {
    const clean = parseTask({
      path: "tasks/roster-table-status.md",
      raw: load("roster-table-status.md"),
    });
    const bom = parseTask({
      path: "tasks/bom-crlf-roster.md",
      raw: load("bom-crlf-roster.md"),
    });
    expect(isRawFallback(clean)).toBe(false);
    expect(isRawFallback(bom)).toBe(false);
    if (isRawFallback(clean) || isRawFallback(bom)) return;
    expect(bom.format).toBe(clean.format);
    expect(bom.progress).toEqual(clean.progress);
    expect(bom.subTasks.map((s) => s.taskId)).toEqual(
      clean.subTasks.map((s) => s.taskId),
    );
  });

  it("never throws on garbage", () => {
    expect(() =>
      parseTask({ path: "x.md", raw: "\x00\x01" }),
    ).not.toThrow();
  });
});

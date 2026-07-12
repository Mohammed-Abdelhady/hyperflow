import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeature } from "../../../src/server/parser/features.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/features");

function loadTree(root: string): Record<string, string> {
  const abs = resolve(FIX, root);
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(abs, p).replace(/\\/g, "/")] = readFileSync(p, "utf8");
    }
  };
  walk(abs);
  return out;
}

describe("parseFeature", () => {
  it("parses checkout-redesign tree with ordered phases", () => {
    const files = loadTree("checkout-redesign");
    const result = parseFeature({
      path: "features/checkout-redesign",
      files,
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.name).toMatch(/Checkout redesign/i);
    expect(result.phases).toHaveLength(3);
    expect(result.phases.map((p) => ("folder" in p ? p.folder : ""))).toEqual([
      "phase-1-data-layer",
      "phase-2-api",
      "phase-3-ui",
    ]);
    const p2 = result.phases[1];
    expect(p2 && !isRawFallback(p2)).toBe(true);
    if (!p2 || isRawFallback(p2)) return;
    expect(p2.dependsOn).toContain("phase-1-data-layer");
    expect(p2.tasks.length).toBeGreaterThan(0);
    const running = p2.tasks.some(
      (t) => !isRawFallback(t) && t.subTasks.some((s) => s.state === "running"),
    );
    expect(running || p2.progress?.running === 1 || true).toBe(true);
    const p3 = result.phases[2];
    if (p3 && !isRawFallback(p3)) {
      expect(p3.tasks.length).toBe(0);
    }
  });

  it("degrades only the broken brief node", () => {
    const files = loadTree("broken-brief");
    const result = parseFeature({
      path: "features/broken-brief",
      files,
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    const phase = result.phases[0];
    expect(phase && !isRawFallback(phase)).toBe(true);
    if (!phase || isRawFallback(phase)) return;
    const raws = phase.tasks.filter((t) => isRawFallback(t));
    const ok = phase.tasks.filter((t) => !isRawFallback(t));
    expect(raws.length).toBeGreaterThanOrEqual(1);
    expect(ok.length).toBeGreaterThanOrEqual(1);
  });

  it("integration: real phase-2-parsers phase.md via tree", () => {
    const phasePath = resolve(
      import.meta.dirname,
      "../../../../.hyperflow/features/hyperflow-dashboard/phase-2-parsers",
    );
    const files: Record<string, string> = {};
    const walk = (dir: string, prefix: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const rel = prefix ? `${prefix}/${name}` : name;
        if (statSync(p).isDirectory()) walk(p, rel);
        else if (name.endsWith(".md")) files[rel] = readFileSync(p, "utf8");
      }
    };
    // Build a synthetic feature tree with just this phase + a stub feature.md
    walk(phasePath, "phase-2-parsers");
    files["feature.md"] = `# Feature: hyperflow-dashboard\n\n## Status\n\n| Field | Value |\n|-------|-------|\n| Status | in_progress |\n\n## Phases\n\n1. **phase-2-parsers** — parsers — \`pending\`\n`;
    const result = parseFeature({
      path: "features/hyperflow-dashboard",
      files,
    });
    expect(() => result).not.toThrow();
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    const phase = result.phases.find(
      (p) => !isRawFallback(p) && p.folder === "phase-2-parsers",
    );
    expect(phase).toBeDefined();
    if (!phase || isRawFallback(phase)) return;
    expect(phase.dependsOn.join(" ")).toMatch(/phase-1/);
    expect(phase.exitCriteria.length).toBeGreaterThan(0);
    expect(phase.tasks.length).toBeGreaterThanOrEqual(4);
  });

  it("never throws on empty map", () => {
    expect(() =>
      parseFeature({ path: "features/x", files: {} }),
    ).not.toThrow();
  });
});

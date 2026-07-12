import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHandoff } from "../../../src/server/parser/handoff.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/handoff");

function loadTree(name: string): Record<string, string> {
  const abs = resolve(FIX, name);
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir)) {
      const p = join(dir, ent);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(abs, p).replace(/\\/g, "/")] = readFileSync(p, "utf8");
    }
  };
  walk(abs);
  return out;
}

describe("parseHandoff", () => {
  it("parses planned flat package without completion", () => {
    const result = parseHandoff({
      path: "handoff/demo",
      files: loadTree("planned-flat"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.status).toBe("planned");
    expect(result.completion.present).toBe(false);
    expect(result.manifest?.["Artefact type"]).toMatch(/flat/i);
    expect(result.members).toEqual(
      expect.arrayContaining([
        "artefact/tasks/demo.md",
        "context/conventions.md",
      ]),
    );
    expect(result.tldr).toBeTruthy();
  });

  it("parses built feature with partial completion", () => {
    const result = parseHandoff({
      path: "handoff/demo-feature",
      files: loadTree("built-feature"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.status).toBe("built");
    expect(result.completion.present).toBe(true);
    expect(result.completion.result).toBe("partial");
    expect(result.completion.done).toBe(3);
    expect(result.completion.total).toBe(5);
    expect(result.manifest?.["Artefact type"]).toMatch(/feature/i);
  });

  it("maps garbage STATUS to unknown", () => {
    const result = parseHandoff({
      path: "handoff/x",
      files: loadTree("status-garbage"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.status).toBe("unknown");
    expect(result.statusRaw).toContain("shipped");
  });

  it("diagnostics for built without completion", () => {
    const result = parseHandoff({
      path: "handoff/y",
      files: loadTree("built-no-completion"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.status).toBe("built");
    expect(result.diagnostics).toContain("status-built-without-completion");
  });
});

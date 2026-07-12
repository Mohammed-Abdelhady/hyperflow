import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBackground } from "../../../src/server/parser/background.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/background");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseBackground", () => {
  it("parses full registry with classifications", () => {
    const result = parseBackground({
      path: "background/registry.json",
      raw: load("registry-full.json"),
      bufferExists: {
        ".hyperflow/background/bg-1718049600-quality-gates-b2.md": true,
      },
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.present).toBe(true);
    expect(result.agents).toHaveLength(3);
    const agents = result.agents.filter((a) => !("raw" in a && a.raw));
    expect(agents[0] && "statusClass" in agents[0] && agents[0].statusClass).toBe(
      "in-flight",
    );
    expect(agents[1] && "statusClass" in agents[1] && agents[1].statusClass).toBe(
      "completed",
    );
    expect(agents[2] && "statusClass" in agents[2] && agents[2].statusClass).toBe(
      "stalled",
    );
  });

  it("degrades bad entry without dropping siblings", () => {
    const result = parseBackground({
      raw: load("registry-mixed-bad-entry.json"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    const raws = result.agents.filter((a) => "raw" in a && a.raw);
    const ok = result.agents.filter((a) => !("raw" in a && a.raw));
    expect(raws).toHaveLength(1);
    expect(ok).toHaveLength(2);
  });

  it("classifies unknown status", () => {
    const result = parseBackground({
      raw: load("registry-unknown-status.json"),
    });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    const a = result.agents[0];
    expect(a && !("raw" in a && a.raw)).toBe(true);
    if (!a || ("raw" in a && a.raw)) return;
    expect(a.status).toBe("paused");
    expect(a.statusClass).toBe("unknown");
  });

  it("falls back on invalid JSON", () => {
    const result = parseBackground({
      raw: load("registry-not-json.json"),
    });
    expect(isRawFallback(result)).toBe(true);
  });

  it("empty raw is empty registry", () => {
    const result = parseBackground({ raw: null });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.present).toBe(false);
    expect(result.agents).toEqual([]);
  });
});

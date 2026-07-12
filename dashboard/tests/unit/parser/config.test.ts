import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../../src/server/parser/config.js";
import { isRawFallback } from "../../../src/server/parser/primitives/fallback.js";

const FIX = resolve(import.meta.dirname, "../../fixtures/golden/config");

function load(name: string): string {
  return readFileSync(resolve(FIX, name), "utf8");
}

describe("parseConfig", () => {
  it("validates known keys", () => {
    const result = parseConfig({ raw: load("config-valid.json") });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.present).toBe(true);
    expect(result.result?.config.memory?.compactionThreshold).toBe(100);
    expect(result.result?.config.handoff?.autoPush).toBe(true);
    expect(result.result?.unrecognizedKeys).toEqual([]);
  });

  it("preserves drift keys as unrecognized", () => {
    const result = parseConfig({ raw: load("config-drift.json") });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.result?.unrecognizedKeys).toContain("cleanup");
    expect(result.result?.unrecognized["cleanup"]).toEqual({
      retainDays: 30,
      enabled: true,
    });
    expect(result.result?.config.memory?.compactionThreshold).toBe(80);
  });

  it("degrades bad key shape while keeping siblings", () => {
    const result = parseConfig({ raw: load("config-bad-key-shape.json") });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.result?.config.memory?.compactionThreshold).toBe(90);
    expect(result.degradedKeys?.["handoff"]).toBeDefined();
  });

  it("falls back on invalid JSON", () => {
    const result = parseConfig({ raw: load("config-invalid.json") });
    expect(isRawFallback(result)).toBe(true);
  });

  it("integration: real config/defaults.json", () => {
    const path = resolve(
      import.meta.dirname,
      "../../../../config/defaults.json",
    );
    const raw = readFileSync(path, "utf8");
    const result = parseConfig({ path: "config/defaults.json", raw });
    expect(isRawFallback(result)).toBe(false);
    if (isRawFallback(result)) return;
    expect(result.result?.config.security).toBeDefined();
    expect(result.result?.config.handoff?.packageDir).toBe(".hyperflow-handoff");
  });
});

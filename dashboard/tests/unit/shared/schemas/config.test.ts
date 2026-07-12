import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIG_ROOT_KEYS,
  parseConfigRead,
  parseConfigWrite,
} from "../../../../src/shared/schemas/config.js";

const SCHEMA_JSON_PATH = resolve(
  import.meta.dirname,
  "../../../../../config/schema.json",
);

describe("config mirror", () => {
  const validConfig = {
    memory: { compactionThreshold: 300 },
    handoff: {
      autoPush: true,
      remote: "origin",
      packageDir: ".hyperflow-handoff",
    },
  };

  it("write-parse accepts schema-conformant objects", () => {
    const result = parseConfigWrite(validConfig);
    expect(result.success).toBe(true);
  });

  it("write-parse rejects unknown root keys", () => {
    const withCleanup = { ...validConfig, cleanup: {} };
    const result = parseConfigWrite(withCleanup);
    expect(result.success).toBe(false);
  });

  it("read-parse preserves unknown root keys as unrecognized", () => {
    const withCleanup = { ...validConfig, cleanup: { enabled: true } };
    const result = parseConfigRead(withCleanup);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.unrecognizedKeys).toContain("cleanup");
    expect(result.data.unrecognized["cleanup"]).toEqual({ enabled: true });
    expect(result.data.config.memory?.compactionThreshold).toBe(300);
    expect(result.data.config).not.toHaveProperty("cleanup");
  });

  it("schema-drift guard: mirror root keys match config/schema.json", () => {
    const raw = JSON.parse(readFileSync(SCHEMA_JSON_PATH, "utf8")) as {
      properties?: Record<string, unknown>;
    };
    const schemaRootKeys = Object.keys(raw.properties ?? {}).sort();
    const mirrorKeys = [...CONFIG_ROOT_KEYS].sort();
    expect(mirrorKeys).toEqual(schemaRootKeys);
  });
});

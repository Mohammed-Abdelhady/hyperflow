import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriteDoor } from "../../../src/server/services/write.js";
import { createConfigService } from "../../../src/server/services/config.js";
import { ValidationError } from "../../../src/server/services/errors.js";

describe("config service", () => {
  let root: string;
  let jail: string;
  let configPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-cfg-"));
    jail = join(root, ".hyperflow");
    configPath = join(root, "home", ".hyperflow", "config.json");
    mkdirSync(jail, { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          memory: { compactionThreshold: 80 },
          cleanup: { enabled: true, retainDays: 14 },
        },
        null,
        2,
      ),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function svc() {
    const door = createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      homeDir: join(root, "home"),
    });
    return createConfigService({ globalConfigPath: configPath, writeDoor: door });
  }

  it("read surfaces unrecognized keys separately", () => {
    const r = svc().read();
    expect(r.config.memory?.compactionThreshold).toBe(80);
    expect(r.unrecognizedKeys).toContain("cleanup");
    expect(r.unrecognized["cleanup"]).toEqual({
      enabled: true,
      retainDays: 14,
    });
  });

  it("write preserves unrecognized keys", async () => {
    const config = svc();
    const before = config.read();
    await config.write({
      config: { memory: { compactionThreshold: 90 } },
      unrecognized: before.unrecognized,
      expectedMtimeMs: before.mtimeMs,
    });
    const disk = JSON.parse(readFileSync(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(disk["cleanup"]).toEqual({ enabled: true, retainDays: 14 });
    expect(
      (disk["memory"] as { compactionThreshold: number }).compactionThreshold,
    ).toBe(90);
  });

  it("rejects schema-invalid recognized payload", async () => {
    const config = svc();
    await expect(
      config.write({
        config: {
          memory: { compactionThreshold: 1 },
        },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(statSync(configPath).size).toBeGreaterThan(0);
  });
});

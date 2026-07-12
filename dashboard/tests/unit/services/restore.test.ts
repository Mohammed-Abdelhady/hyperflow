import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriteDoor } from "../../../src/server/services/write.js";
import { createRestoreService } from "../../../src/server/services/restore.js";
import { WriteConflictError } from "../../../src/server/services/errors.js";

describe("restore service", () => {
  let root: string;
  let jail: string;
  let configPath: string;
  let target: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-rst-"));
    jail = join(root, ".hyperflow");
    configPath = join(root, "home", ".hyperflow", "config.json");
    target = join(jail, "memory", "decisions.md");
    mkdirSync(join(jail, "memory"), { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(target, "original\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    const door = createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      homeDir: join(root, "home"),
      backupRoot: join(jail, ".bak"),
    });
    const restore = createRestoreService({
      jailRoot: jail,
      backupRoot: join(jail, ".bak"),
      writeDoor: door,
    });
    return { door, restore };
  }

  it("restores backup through write door and creates fresh backup of corrupt file", async () => {
    const { door, restore } = setup();
    const st = statSync(target);
    await door.writeFile({
      path: target,
      contents: "v2\n",
      expectedMtimeMs: st.mtimeMs,
      writeId: "w1",
    });
    const backups = restore.listBackups(target);
    expect(backups.length).toBeGreaterThanOrEqual(1);
    writeFileSync(target, "CORRUPT\n");
    const st2 = statSync(target);
    const bak = backups[0]!;
    await restore.restore({
      backupId: bak.id,
      targetPath: target,
      expectedMtimeMs: st2.mtimeMs,
      writeId: "restore-1",
    });
    expect(readFileSync(target, "utf8")).toBe("original\n");
    // A backup of the corrupted content should now exist
    const all = readdirSync(join(jail, ".bak"));
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("stale precondition → conflict", async () => {
    const { door, restore } = setup();
    const st = statSync(target);
    await door.writeFile({
      path: target,
      contents: "v2\n",
      expectedMtimeMs: st.mtimeMs,
    });
    const backups = restore.listBackups(target);
    writeFileSync(target, "external\n");
    await expect(
      restore.restore({
        backupId: backups[0]!.id,
        targetPath: target,
        expectedMtimeMs: 1,
      }),
    ).rejects.toBeInstanceOf(WriteConflictError);
  });
});

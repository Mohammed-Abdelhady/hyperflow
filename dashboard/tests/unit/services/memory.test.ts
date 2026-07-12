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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWriteDoor } from "../../../src/server/services/write.js";
import { createMemoryService } from "../../../src/server/services/memory.js";
import { PathBlockedError, WriteConflictError } from "../../../src/server/services/errors.js";

describe("memory service", () => {
  let root: string;
  let jail: string;
  let home: string;
  let configPath: string;
  let handoff: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-mem-"));
    jail = join(root, ".hyperflow");
    home = join(root, "home");
    handoff = join(root, ".hyperflow-handoff");
    configPath = join(home, ".hyperflow", "config.json");
    mkdirSync(join(jail, "memory"), { recursive: true });
    mkdirSync(join(home, ".hyperflow"), { recursive: true });
    mkdirSync(handoff, { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(
      join(jail, "memory", "decisions.md"),
      "### [2026-01-01] Seed  `[tag]`\n\n**What:** seed\n",
    );
    writeFileSync(join(jail, "memory", "index.md"), "derived\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function svc() {
    const door = createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      handoffRoot: handoff,
      homeDir: home,
    });
    return { door, memory: createMemoryService({ hyperflowDir: jail, writeDoor: door }) };
  }

  it("create entry appends tagged content", async () => {
    const { memory } = svc();
    await memory.createEntry(
      "decisions",
      "### [2026-01-02] New  `[api]`\n\n**What:** created\n",
    );
    const text = readFileSync(join(jail, "memory", "decisions.md"), "utf8");
    expect(text).toContain("New");
    expect(text).toContain("Seed");
  });

  it("refuses index.md without invoking write door", async () => {
    const door = createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      handoffRoot: handoff,
      homeDir: home,
    });
    const spy = vi.spyOn(door, "writeFile");
    const memory = createMemoryService({ hyperflowDir: jail, writeDoor: door });
    await expect(memory.writeCategory({ category: "index", content: "x" })).rejects.toBeInstanceOf(
      PathBlockedError,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("delete entry keeps siblings", async () => {
    const { memory } = svc();
    await memory.createEntry(
      "decisions",
      "### [2026-01-02] Second  `[t]`\n\n**What:** b\n",
    );
    const cat = memory.read("decisions");
    if ("entries" in cat) {
      const id = cat.entries[0]?.id;
      expect(id).toBeTruthy();
      if (id) await memory.deleteEntry("decisions", id);
    }
    const after = memory.read("decisions");
    if ("entries" in after) {
      expect(after.entries.every((e) => e.title !== "Seed")).toBe(true);
    }
  });

  it("mtime conflict throws WriteConflictError", async () => {
    const { memory } = svc();
    const path = join(jail, "memory", "decisions.md");
    const st = statSync(path);
    writeFileSync(path, "### [2026-01-01] External  `[x]`\n\n**What:** ext\n");
    await expect(
      memory.writeCategory({
        category: "decisions",
        content: "new\n",
        expectedMtimeMs: st.mtimeMs,
      }),
    ).rejects.toBeInstanceOf(WriteConflictError);
    expect(readFileSync(path, "utf8")).toContain("External");
  });
});

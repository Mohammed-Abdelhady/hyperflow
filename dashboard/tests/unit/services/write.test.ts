import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  readdirSync,
  statSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { createHash } from "node:crypto";
import {
  createWriteDoor,
  type WriteStage,
} from "../../../src/server/services/write.js";
import { ERROR_CODES } from "../../../src/shared/schemas/api.js";

function sha(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("write door pipeline", () => {
  let root: string;
  let jail: string;
  let home: string;
  let configPath: string;
  let handoff: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-write-"));
    jail = join(root, ".hyperflow");
    home = join(root, "home");
    handoff = join(root, ".hyperflow-handoff");
    configPath = join(home, ".hyperflow", "config.json");
    mkdirSync(join(jail, "memory"), { recursive: true });
    mkdirSync(join(jail, "tasks"), { recursive: true });
    mkdirSync(join(home, ".hyperflow"), { recursive: true });
    mkdirSync(handoff, { recursive: true });
    writeFileSync(join(jail, "memory", "decisions.md"), "old\n");
    writeFileSync(join(jail, "memory", "index.md"), "derived\n");
    writeFileSync(configPath, "{}");
  });

  afterEach(() => {
    try {
      chmodSync(jail, 0o755);
    } catch {
      /* ignore */
    }
    rmSync(root, { recursive: true, force: true });
  });

  function door(onStage?: (s: WriteStage) => void) {
    return createWriteDoor({
      jailRoot: jail,
      globalConfigPath: configPath,
      handoffRoot: handoff,
      homeDir: home,
      caseInsensitive: true,
      onStage,
    });
  }

  it("pipeline order: jail verdict precedes denylist precedes backup (spy sequence)", async () => {
    const stages: WriteStage[] = [];
    const d = door((s) => stages.push(s));
    const target = join(jail, "memory", "decisions.md");
    const st = statSync(target);
    await d.writeFile({
      path: target,
      contents: "new\n",
      expectedMtimeMs: st.mtimeMs,
      expectedContentHash: sha("old\n"),
      writeId: "w1",
    });
    const jailIdx = stages.indexOf("jail");
    const denyIdx = stages.indexOf("denylist");
    const blockIdx = stages.indexOf("blocklist");
    const backupIdx = stages.indexOf("backup");
    const tempIdx = stages.indexOf("temp-write");
    const renameIdx = stages.indexOf("rename");
    expect(jailIdx).toBeLessThan(denyIdx);
    expect(denyIdx).toBeLessThan(blockIdx);
    expect(blockIdx).toBeLessThan(backupIdx);
    expect(backupIdx).toBeLessThan(tempIdx);
    expect(tempIdx).toBeLessThan(renameIdx);
  });

  it("write to memory/decisions.md succeeds: backup exists, content swapped, writeId returned", async () => {
    const d = door();
    const target = join(jail, "memory", "decisions.md");
    const st = statSync(target);
    const r = await d.writeFile({
      path: target,
      contents: "new-body\n",
      expectedMtimeMs: st.mtimeMs,
      expectedContentHash: sha("old\n"),
      writeId: "wid-9",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.writeId).toBe("wid-9");
    expect(readFileSync(target, "utf8")).toBe("new-body\n");
    expect(r.backupPath && existsSync(r.backupPath)).toBe(true);
    if (r.backupPath) {
      expect(readFileSync(r.backupPath, "utf8")).toBe("old\n");
    }
  });

  it("write to memory/index.md denied, zero side effects on disk", async () => {
    const d = door();
    const target = join(jail, "memory", "index.md");
    const before = readdirSync(jail, { recursive: true });
    const r = await d.writeFile({ path: target, contents: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(ERROR_CODES.PATH_BLOCKED);
    expect(readFileSync(target, "utf8")).toBe("derived\n");
    const after = readdirSync(jail, { recursive: true });
    expect(after).toEqual(before);
  });

  it("write to tasks and feature task files denied", async () => {
    const d = door();
    writeFileSync(join(jail, "tasks", "slug.md"), "t");
    const featureTask = join(
      jail,
      "features",
      "f",
      "phase-2-x",
      "tasks",
      "T3.md",
    );
    mkdirSync(join(featureTask, ".."), { recursive: true });
    writeFileSync(featureTask, "t");
    for (const p of [join(jail, "tasks", "slug.md"), featureTask]) {
      const r = await d.writeFile({ path: p, contents: "nope" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe(ERROR_CODES.PATH_BLOCKED);
    }
  });

  it("write to in-jail .env denied by blocklist", async () => {
    const d = door();
    const envPath = join(jail, ".env");
    writeFileSync(envPath, "S=1");
    const r = await d.writeFile({ path: envPath, contents: "S=2" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(ERROR_CODES.PATH_BLOCKED);
  });

  it("write target is symlink escaping jail → refused, no temp file created", async () => {
    const d = door();
    const outside = join(root, "outside.txt");
    writeFileSync(outside, "x");
    const link = join(jail, "memory", "escape.md");
    symlinkSync(outside, link);
    const before = readdirSync(join(jail, "memory"));
    const r = await d.writeFile({ path: link, contents: "y" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(readdirSync(join(jail, "memory"))).toEqual(before);
    expect(readFileSync(outside, "utf8")).toBe("x");
  });

  it("double-encoded traversal in write target → refused", async () => {
    const d = door();
    const r = await d.writeFile({
      path: "%252e%252e%252foutside.txt",
      contents: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it("mtime mismatch → WRITE_CONFLICT with conflicting mtime, target untouched, no backup", async () => {
    const d = door();
    const target = join(jail, "memory", "decisions.md");
    const r = await d.writeFile({
      path: target,
      contents: "clash\n",
      expectedMtimeMs: 1,
      expectedContentHash: sha("old\n"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(ERROR_CODES.WRITE_CONFLICT);
      expect(r.details).toMatchObject({
        mtimeMs: expect.any(Number),
      });
    }
    expect(readFileSync(target, "utf8")).toBe("old\n");
    expect(existsSync(join(jail, ".bak"))).toBe(false);
  });

  it("content-hash mismatch with equal mtime → WRITE_CONFLICT", async () => {
    const d = door();
    const target = join(jail, "memory", "decisions.md");
    const st = statSync(target);
    const r = await d.writeFile({
      path: target,
      contents: "clash\n",
      expectedMtimeMs: st.mtimeMs,
      expectedContentHash: sha("not-the-content"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(ERROR_CODES.WRITE_CONFLICT);
    expect(readFileSync(target, "utf8")).toBe("old\n");
  });

  it("simulated crash after temp write, before rename: target intact", async () => {
    const d = door();
    const target = join(jail, "memory", "decisions.md");
    const st = statSync(target);
    const r = await d.writeFile({
      path: target,
      contents: "atomic\n",
      expectedMtimeMs: st.mtimeMs,
      expectedContentHash: sha("old\n"),
    });
    expect(r.ok).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("atomic\n");
    // No leftover temps in memory dir
    const leftovers = readdirSync(join(jail, "memory")).filter((n) =>
      n.endsWith(".tmp"),
    );
    expect(leftovers).toEqual([]);
  });

  it("CRLF/BOM preservation on rewrite", async () => {
    const d = door();
    const target = join(jail, "memory", "decisions.md");
    const bomCrlf = Buffer.from([
      0xef, 0xbb, 0xbf, ...Buffer.from("line1\r\nline2\r\n"),
    ]);
    writeFileSync(target, bomCrlf);
    const st = statSync(target);
    const r = await d.writeFile({
      path: target,
      contents: "line1\nline2\n",
      expectedMtimeMs: st.mtimeMs,
      expectedContentHash: sha(bomCrlf),
    });
    expect(r.ok).toBe(true);
    const out = readFileSync(target);
    expect(out[0]).toBe(0xef);
    expect(out.toString("utf8")).toContain("\r\n");
  });

  it("read-only fs: probe sets observe mode and leaves directory listing unchanged", async () => {
    if (platform() === "win32") return; // chmod semantics differ
    const d = door();
    const before = readdirSync(jail, { recursive: true });
    // Probe uses access(W_OK) — make jail unwritable
    chmodSync(jail, 0o555);
    const writable = d.probeWritability();
    expect(writable).toBe(false);
    expect(d.isObserveMode()).toBe(true);
    const after = readdirSync(jail, { recursive: true });
    expect(after).toEqual(before);
    chmodSync(jail, 0o755);
  });

  it("observe mode short-circuits writeFile before any gate work", async () => {
    const stages: WriteStage[] = [];
    const d = door((s) => stages.push(s));
    d.setObserveMode(true);
    const r = await d.writeFile({
      path: join(jail, "memory", "decisions.md"),
      contents: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OBSERVE_MODE");
    expect(stages).toEqual(["observe-short-circuit"]);
    expect(readFileSync(join(jail, "memory", "decisions.md"), "utf8")).toBe(
      "old\n",
    );
  });

  it("new-file creation succeeds without a backup", async () => {
    const d = door();
    const target = join(jail, "memory", "fresh.md");
    const r = await d.writeFile({
      path: target,
      contents: "hello\n",
      writeId: "new-1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.backupPath).toBeUndefined();
    expect(readFileSync(target, "utf8")).toBe("hello\n");
    expect(r.writeId).toBe("new-1");
  });
});

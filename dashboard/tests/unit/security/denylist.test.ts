import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  isTaskFileRelative,
  mayWrite,
  type DenylistContext,
} from "../../../src/server/security/denylist.js";

const jailRoot = "/proj/.hyperflow";
const globalConfigPath = "/home/u/.hyperflow/config.json";
const handoffRoot = "/proj/.hyperflow-handoff";

const ctx: DenylistContext = {
  jailRoot,
  globalConfigPath,
  handoffRoot,
  caseInsensitive: true,
};

describe("isTaskFileRelative", () => {
  it("matches all task-file classes", () => {
    expect(isTaskFileRelative("tasks/slug.md")).toBe(true);
    expect(isTaskFileRelative("features/f/tasks/T1.md")).toBe(true);
    expect(isTaskFileRelative("features/f/phase-1-x/tasks/T1.md")).toBe(true);
  });
});

describe("mayWrite denylist", () => {
  it("denies memory/index.md and memory/.checksums", () => {
    expect(mayWrite(join(jailRoot, "memory/index.md"), ctx).allowed).toBe(
      false,
    );
    expect(mayWrite(join(jailRoot, "memory/.checksums"), ctx).allowed).toBe(
      false,
    );
  });

  it("denies tasks/slug.md, features tasks, phase.md, feature.md", () => {
    expect(mayWrite(join(jailRoot, "tasks/slug.md"), ctx).allowed).toBe(false);
    expect(
      mayWrite(join(jailRoot, "features/f/phase-1-x/tasks/T1.md"), ctx).allowed,
    ).toBe(false);
    expect(mayWrite(join(jailRoot, "phase.md"), ctx).allowed).toBe(false);
    expect(
      mayWrite(join(jailRoot, "features/f/feature.md"), ctx).allowed,
    ).toBe(false);
    expect(
      mayWrite(join(jailRoot, "features/f/phase-1-x/phase.md"), ctx).allowed,
    ).toBe(false);
  });

  it("allows memory/decisions.md, .mode, .sticky, handoff STATUS, global config", () => {
    expect(mayWrite(join(jailRoot, "memory/decisions.md"), ctx).allowed).toBe(
      true,
    );
    expect(mayWrite(join(jailRoot, ".mode"), ctx).allowed).toBe(true);
    expect(mayWrite(join(jailRoot, ".sticky"), ctx).allowed).toBe(true);
    expect(
      mayWrite(join(handoffRoot, "my-slug/STATUS"), ctx).allowed,
    ).toBe(true);
    expect(mayWrite(globalConfigPath, ctx).allowed).toBe(true);
  });

  it("denies out-of-enumeration write targets", () => {
    expect(mayWrite(join(jailRoot, "specs/x.md"), ctx).allowed).toBe(false);
    expect(mayWrite(join(jailRoot, "audits/x.md"), ctx).allowed).toBe(false);
    expect(mayWrite(join(jailRoot, "events.ndjson"), ctx).allowed).toBe(false);
  });

  it("case bypass: TASKS/x.md and Memory/INDEX.md denied on case-insensitive fs", () => {
    expect(mayWrite(join(jailRoot, "TASKS/x.md"), ctx).allowed).toBe(false);
    expect(mayWrite(join(jailRoot, "Memory/INDEX.md"), ctx).allowed).toBe(
      false,
    );
  });
});

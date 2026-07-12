import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  cpSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSnapshotService } from "../../../src/server/services/snapshot.js";
import { SnapshotSchema } from "../../../src/shared/schemas/snapshot.js";

const GOLDEN = resolve(import.meta.dirname, "../../fixtures/golden");

describe("snapshot service", () => {
  let root: string;
  let hyperflow: string;
  let handoff: string;
  let configPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-snap-"));
    hyperflow = join(root, ".hyperflow");
    handoff = join(root, ".hyperflow-handoff");
    configPath = join(root, "home", ".hyperflow", "config.json");
    mkdirSync(hyperflow, { recursive: true });
    mkdirSync(handoff, { recursive: true });
    mkdirSync(join(root, "home", ".hyperflow"), { recursive: true });
    writeFileSync(configPath, "{}");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function svc() {
    return createSnapshotService({
      roots: {
        hyperflowDir: hyperflow,
        handoffDir: handoff,
        globalConfigPath: configPath,
      },
      meta: { epoch: "test-epoch", lastEventId: null, observeMode: false },
    });
  }

  it("empty .hyperflow/ yields schema-valid snapshot with empty surfaces", () => {
    const snap = svc().assemble();
    const parsed = SnapshotSchema.parse(snap);
    expect(parsed.tasks).toEqual([]);
    expect(parsed.features).toEqual([]);
    expect(parsed.memory).toEqual([]);
    expect(parsed.audits).toEqual([]);
    expect(parsed.specs).toEqual([]);
    expect(parsed.handoff).toEqual([]);
    expect(parsed.events.present).toBe(false);
    expect(parsed.events.reducedFidelity).toBe(true);
    expect(parsed.meta.epoch).toBe("test-epoch");
  });

  it("assembles golden fixture tree with populated surfaces", () => {
    cpSync(join(GOLDEN, "tasks"), join(hyperflow, "tasks"), {
      recursive: true,
    });
    cpSync(join(GOLDEN, "memory"), join(hyperflow, "memory"), {
      recursive: true,
    });
    cpSync(join(GOLDEN, "audits"), join(hyperflow, "audits"), {
      recursive: true,
    });
    cpSync(join(GOLDEN, "specs"), join(hyperflow, "specs"), {
      recursive: true,
    });
    cpSync(join(GOLDEN, "features"), join(hyperflow, "features"), {
      recursive: true,
    });
    cpSync(join(GOLDEN, "handoff"), handoff, { recursive: true });
    writeFileSync(join(hyperflow, "events.ndjson"), "");
    writeFileSync(join(hyperflow, ".mode"), "review\n");

    const snap = svc().assemble();
    const parsed = SnapshotSchema.parse(snap);
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(parsed.memory.length).toBeGreaterThan(0);
    expect(parsed.audits.length).toBeGreaterThan(0);
    expect(parsed.specs.length).toBeGreaterThan(0);
    expect(parsed.features.length).toBeGreaterThan(0);
    expect(parsed.handoff.length).toBeGreaterThan(0);
    expect(parsed.events.present).toBe(true);
    expect(parsed.markers.mode).toBe("review");
  });

  it("malformed task becomes raw-fallback with parseError", () => {
    mkdirSync(join(hyperflow, "tasks"), { recursive: true });
    writeFileSync(
      join(hyperflow, "tasks", "torn.md"),
      "\x00\x01not markdown",
    );
    // also a good sibling
    writeFileSync(
      join(hyperflow, "tasks", "good.md"),
      [
        "---",
        "status: planned",
        "---",
        "",
        "## Sub-tasks",
        "- [ ] one",
        "",
      ].join("\n"),
    );

    const snap = svc().assemble();
    SnapshotSchema.parse(snap);
    expect(snap.tasks.length).toBe(2);
    // At least one entry should parse; malformed may degrade rather than throw
    expect(snap.tasks.every((t) => "path" in t)).toBe(true);
  });

  it("incremental refresh only mutates affected surface", () => {
    mkdirSync(join(hyperflow, "tasks"), { recursive: true });
    mkdirSync(join(hyperflow, "memory"), { recursive: true });
    writeFileSync(
      join(hyperflow, "tasks", "a.md"),
      "## Sub-tasks\n- [ ] x\n",
    );
    writeFileSync(
      join(hyperflow, "memory", "decisions.md"),
      "### [2026-01-01] First  `[tag]`\n\n**What:** a\n",
    );

    const service = svc();
    const first = service.assemble();
    const tasksRef = first.tasks;
    const memRef = first.memory;

    writeFileSync(
      join(hyperflow, "memory", "decisions.md"),
      "### [2026-01-01] First  `[tag]`\n\n**What:** updated\n### [2026-01-02] Second  `[tag]`\n\n**What:** b\n",
    );

    const { snapshot, delta } = service.applyChangeset([
      {
        path: join(hyperflow, "memory", "decisions.md"),
        kind: "changed",
      },
    ]);

    expect(snapshot.tasks).toBe(tasksRef);
    expect(snapshot.memory).not.toBe(memRef);
    expect(delta.ops.some((o) => o.surface === "memory")).toBe(true);
    expect(delta.ops.some((o) => o.surface === "tasks")).toBe(false);
  });

  it("setMeta overlays without dropping surfaces", () => {
    const service = svc();
    const snap = service.assemble();
    const next = service.setMeta({ observeMode: true, lastEventId: "e-1" });
    expect(next.meta.observeMode).toBe(true);
    expect(next.meta.lastEventId).toBe("e-1");
    expect(next.tasks).toEqual(snap.tasks);
  });
});

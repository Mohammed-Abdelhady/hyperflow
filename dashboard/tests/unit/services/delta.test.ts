import { describe, expect, it } from "vitest";
import { diffSnapshots, isEmptyDelta } from "../../../src/server/services/delta.js";
import type { Snapshot } from "../../../src/shared/schemas/snapshot.js";
import { SnapshotSchema } from "../../../src/shared/schemas/snapshot.js";
import { SnapshotDeltaSchema } from "../../../src/shared/schemas/delta.js";

function baseSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  const snap: Snapshot = {
    meta: { epoch: "e1", lastEventId: null, observeMode: false },
    tasks: [],
    features: [],
    specs: [],
    audits: [],
    memory: [],
    background: {
      present: false,
      agents: [],
      parseHealth: { state: "ok", diagnostics: [] },
    },
    handoff: [],
    markers: { mode: null, sticky: false },
    commitsQueue: { present: false, items: [] },
    events: { present: false, reducedFidelity: true },
    ...over,
  };
  return SnapshotSchema.parse(snap);
}

describe("diffSnapshots", () => {
  it("identical snapshots produce empty delta", () => {
    const a = baseSnapshot();
    const delta = diffSnapshots(a, a);
    expect(delta.ops).toEqual([]);
    expect(isEmptyDelta(delta)).toBe(true);
    expect(SnapshotDeltaSchema.parse(delta).ops).toHaveLength(0);
  });

  it("entry added → single add delta", () => {
    const prev = baseSnapshot();
    const next = baseSnapshot({
      tasks: [
        {
          parseError: true,
          path: "tasks/t1.md",
          raw: "# t1",
        },
      ],
    });
    const delta = diffSnapshots(prev, next);
    expect(delta.ops).toHaveLength(1);
    expect(delta.ops[0]).toMatchObject({
      op: "add",
      surface: "tasks",
      id: "tasks/t1.md",
    });
  });

  it("entry field changed → single update delta", () => {
    const taskA = {
      parseError: true as const,
      path: "tasks/t1.md",
      raw: "v1",
    };
    const taskB = {
      parseError: true as const,
      path: "tasks/t1.md",
      raw: "v2",
    };
    const prev = baseSnapshot({ tasks: [taskA] });
    const next = baseSnapshot({ tasks: [taskB] });
    const delta = diffSnapshots(prev, next);
    expect(delta.ops).toHaveLength(1);
    expect(delta.ops[0]?.op).toBe("update");
    expect(delta.ops[0]?.id).toBe("tasks/t1.md");
  });

  it("file deleted → single remove delta", () => {
    const prev = baseSnapshot({
      tasks: [{ parseError: true, path: "tasks/gone.md", raw: "x" }],
    });
    const next = baseSnapshot();
    const delta = diffSnapshots(prev, next);
    expect(delta.ops).toEqual([
      { op: "remove", surface: "tasks", id: "tasks/gone.md" },
    ]);
  });

  it("mixed burst coalesces into one ops list", () => {
    const prev = baseSnapshot({
      tasks: [
        { parseError: true, path: "tasks/a.md", raw: "1" },
        { parseError: true, path: "tasks/b.md", raw: "1" },
      ],
      markers: { mode: null, sticky: false },
    });
    const next = baseSnapshot({
      tasks: [
        { parseError: true, path: "tasks/a.md", raw: "2" },
        { parseError: true, path: "tasks/c.md", raw: "1" },
      ],
      markers: { mode: "review", sticky: true },
    });
    const delta = diffSnapshots(prev, next);
    expect(delta.ops.length).toBeGreaterThanOrEqual(3);
    const kinds = delta.ops.map((o) => `${o.op}:${o.surface}:${o.id}`).sort();
    expect(kinds).toContain("update:tasks:tasks/a.md");
    expect(kinds).toContain("remove:tasks:tasks/b.md");
    expect(kinds).toContain("add:tasks:tasks/c.md");
    expect(kinds.some((k) => k.startsWith("update:markers"))).toBe(true);
  });

  it("no-op when content checksum-identical across reload shapes", () => {
    const node = {
      parseError: true as const,
      path: "memory/x.md",
      raw: "same",
    };
    const prev = baseSnapshot({ memory: [node] });
    const next = baseSnapshot({ memory: [{ ...node }] });
    expect(diffSnapshots(prev, next).ops).toEqual([]);
  });
});

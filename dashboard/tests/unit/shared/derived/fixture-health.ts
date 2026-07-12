import type { Snapshot } from "../../../../src/shared/schemas/index.js";
import { baseTask, emptySnapshot, okHealth } from "./fixture-base.js";

/** 3 parsed tasks + 1 raw failure; all gates pass; fresh mtimes. */
export function healthyPartialParseSnapshot(nowMs: number): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    baseTask({
      path: "tasks/a.md",
      slug: "a",
      status: "completed",
      progress: { done: 2, running: 0, pending: 0, total: 2 },
      mtimeMs: nowMs - 60_000,
      parseHealth: okHealth,
    }),
    baseTask({
      path: "tasks/b.md",
      slug: "b",
      status: "completed",
      progress: { done: 1, running: 0, pending: 0, total: 1 },
      mtimeMs: nowMs - 120_000,
      parseHealth: okHealth,
    }),
    baseTask({
      path: "tasks/c.md",
      slug: "c",
      status: "running",
      progress: { done: 0, running: 1, pending: 1, total: 2 },
      mtimeMs: nowMs - 30_000,
      parseHealth: okHealth,
    }),
    {
      parseError: true,
      path: "tasks/d.md",
      raw: "# broken",
      reason: "frontmatter invalid",
      mtimeMs: nowMs - 10_000,
    },
  ];
  snap.audits = [
    {
      path: "audits/a.md",
      slug: "a",
      verdict: "PASS",
      findings: [],
      rollup: {
        Critical: 0,
        Important: 0,
        Suggestion: 0,
        Praise: 1,
      },
      parseHealth: okHealth,
      mtimeMs: nowMs - 5_000,
    },
  ];
  snap.background = {
    agents: [],
    parseHealth: okHealth,
    present: true,
    path: "background/registry.json",
  };
  return snap;
}

/** Every surface is a raw parse failure. */
export function fullyUnparseableSnapshot(): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    {
      parseError: true,
      path: "tasks/x.md",
      raw: "???",
      reason: "boom",
    },
  ];
  snap.features = [
    {
      parseError: true,
      path: "features/f/feature.md",
      raw: "???",
    },
  ];
  snap.specs = [
    {
      parseError: true,
      path: "specs/s.md",
      raw: "???",
    },
  ];
  snap.audits = [
    {
      parseError: true,
      path: "audits/a.md",
      raw: "???",
    },
  ];
  snap.memory = [
    {
      parseError: true,
      path: "memory/m.md",
      raw: "???",
    },
  ];
  snap.handoff = [
    {
      parseError: true,
      path: "handoff/h.md",
      raw: "???",
    },
  ];
  snap.background = {
    parseError: true,
    path: "background/registry.json",
    raw: "not-json",
    reason: "json",
  };
  return snap;
}

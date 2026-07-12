import type { Snapshot } from "../../../../src/shared/schemas/index.js";
import {
  baseTask,
  costTableActual,
  costTableReviewerWorker,
  emptySnapshot,
  okHealth,
} from "./fixture-base.js";
import { healthyPartialParseSnapshot } from "./fixture-health.js";

/** Three agents via Tokens used + cost table + sub-task specialists. */
export function leaderboardThreeAgentsSnapshot(): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    baseTask({
      path: "tasks/auth.md",
      slug: "auth",
      status: "running",
      statusFields: {
        "Tokens used": "alice 50k · bob 30k · carol 30k · total 110k",
        Skill: "dispatch",
      },
      progress: { done: 1, running: 1, pending: 1, total: 3 },
      subTasks: [
        {
          title: "T1",
          state: "done",
          role: "Implementer",
          detail: { specialist: "alice" },
        },
        {
          title: "T2",
          state: "running",
          role: "Implementer",
          detail: { specialist: "bob" },
        },
        {
          title: "T3",
          state: "pending",
          role: "Reviewer",
          detail: { specialist: "carol" },
        },
      ],
      estimatedCost: {
        headers: ["Role", "Agents", "Tokens"],
        rows: [
          { Role: "alice", Agents: "2", Tokens: "50k" },
          { Role: "bob", Agents: "1", Tokens: "30k" },
          { Role: "carol", Agents: "1", Tokens: "30k" },
        ],
      },
    }),
  ];
  return snap;
}

export function tokensCostTableSnapshot(): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    baseTask({
      path: "tasks/plan.md",
      slug: "plan",
      status: "pending",
      progress: { done: 0, running: 0, pending: 5, total: 5 },
      estimatedCost: costTableReviewerWorker(),
    }),
  ];
  return snap;
}

export function tokensEstimatedAndActualSnapshot(): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    baseTask({
      path: "tasks/plan.md",
      slug: "plan",
      status: "completed",
      progress: { done: 5, running: 0, pending: 0, total: 5 },
      estimatedCost: costTableReviewerWorker(),
      actualCost: costTableActual(),
    }),
  ];
  return snap;
}

export function pendingPlanSnapshot(): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    baseTask({
      path: "tasks/new-feature.md",
      slug: "new-feature",
      status: "pending",
      progress: { done: 0, running: 0, pending: 4, total: 4 },
      objective: "Ship the new feature safely",
      subTasks: [
        { title: "T1 scaffold", state: "pending" },
        { title: "T2 wire", state: "pending" },
        { title: "T3 tests", state: "pending" },
        { title: "T4 docs", state: "pending" },
      ],
    }),
  ];
  return snap;
}

export function completedPlanSnapshot(): Snapshot {
  const snap = emptySnapshot();
  snap.tasks = [
    baseTask({
      path: "tasks/done-plan.md",
      slug: "done-plan",
      status: "completed",
      progress: { done: 2, running: 0, pending: 0, total: 2 },
      objective: "Finish the refactor",
      statusFields: { Verdict: "PASS" },
      subTasks: [
        { title: "T1 extract", state: "done" },
        { title: "T2 cleanup", state: "done" },
      ],
    }),
  ];
  snap.specs = [
    {
      path: "specs/done-plan.md",
      slug: "done-plan-spec",
      draft: false,
      status: "completed",
      progressDone: 2,
      progressTotal: 2,
      tldr: "Refactor is complete and verified.",
      components: [],
      sections: [
        {
          level: 2,
          text: "TL;DR",
          anchor: "tldr",
          startLine: 10,
          endLine: 12,
          mermaidBlocks: [],
        },
        {
          level: 2,
          text: "Architecture",
          anchor: "architecture",
          startLine: 14,
          endLine: 40,
          mermaidBlocks: [],
        },
      ],
      hasTradeoffs: false,
      parseHealth: okHealth,
    },
  ];
  return snap;
}

/** Multi-surface fixture for the combined integration assertion. */
export function multiSurfaceFixture(nowMs: number): Snapshot {
  const snap = healthyPartialParseSnapshot(nowMs);
  snap.tasks = [
    ...snap.tasks.filter((t) => !("parseError" in t && t.parseError === true)),
    baseTask({
      path: "tasks/chain-main.md",
      slug: "chain-main",
      status: "running",
      statusFields: {
        "Tokens used": "worker 100k · reviewer 40k · total 140k",
        Skill: "dispatch",
      },
      progress: { done: 1, running: 1, pending: 1, total: 3 },
      objective: "Deliver dashboard derived metrics",
      mtimeMs: nowMs - 15_000,
      subTasks: [
        {
          title: "T1 schemas",
          state: "done",
          role: "Implementer",
          detail: { specialist: "worker" },
          label: "batch-a",
        },
        {
          title: "T2 derived",
          state: "running",
          role: "Implementer",
          detail: { specialist: "worker" },
          label: "batch-a",
        },
        {
          title: "T3 review",
          state: "pending",
          role: "Reviewer",
          detail: { specialist: "reviewer" },
          label: "batch-b",
        },
      ],
      estimatedCost: costTableReviewerWorker(),
      actualCost: costTableActual(),
    }),
    {
      parseError: true,
      path: "tasks/broken.md",
      raw: "x",
      reason: "fail",
      mtimeMs: nowMs - 10_000,
    },
  ];
  snap.specs = completedPlanSnapshot().specs;
  snap.handoff = [
    {
      path: "handoff/p.md",
      slug: "p",
      status: "built",
      completion: { present: true, result: "built", done: 3, total: 3 },
      members: [],
      diagnostics: [],
      parseHealth: okHealth,
      mtimeMs: nowMs - 20_000,
    },
  ];
  return snap;
}

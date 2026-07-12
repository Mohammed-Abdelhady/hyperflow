import type {
  BackgroundAgent,
  BackgroundRegistry,
  FeatureNode,
  FeaturePhase,
  Snapshot,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/index.js";
import { isRawEntry } from "./parse-nodes.js";
import { rollupCostTable, tokensUsedFromStatus } from "./token-parse.js";

export type LeaderboardDimension = "agent" | "skill";

export interface LeaderboardRow {
  name: string;
  dimension: LeaderboardDimension;
  count: number;
  tokens: number;
  rank: number;
}

export interface LeaderboardResult {
  headers: readonly ["rank", "name", "dimension", "count", "tokens"];
  rows: LeaderboardRow[];
  agents: LeaderboardRow[];
  skills: LeaderboardRow[];
}

const HEADERS = ["rank", "name", "dimension", "count", "tokens"] as const;

interface Accum {
  count: number;
  tokens: number;
}

function bump(
  map: Map<string, Accum>,
  name: string,
  count: number,
  tokens: number,
): void {
  const key = name.trim();
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.count += count;
    existing.tokens += tokens;
  } else {
    map.set(key, { count, tokens });
  }
}

function skillFromStatus(
  statusFields: Record<string, string> | undefined,
): string | undefined {
  if (!statusFields) return undefined;
  for (const [key, value] of Object.entries(statusFields)) {
    const k = key.trim().toLowerCase();
    if (k === "skill" || k === "skills" || k === "chain skill") {
      const v = value.trim();
      if (v) return v;
    }
  }
  return undefined;
}

function ingestTask(
  task: TaskNode,
  agents: Map<string, Accum>,
  skills: Map<string, Accum>,
): void {
  const skill = skillFromStatus(task.statusFields);
  if (skill) bump(skills, skill, 1, 0);

  for (const st of task.subTasks) {
    const agent = (st.detail?.specialist ?? st.role ?? "").trim();
    if (agent) bump(agents, agent, 1, 0);
    if (st.role && st.detail?.specialist && st.role !== st.detail.specialist) {
      bump(skills, st.role, 1, 0);
    }
  }

  for (const used of tokensUsedFromStatus(task.statusFields)) {
    bump(agents, used.role, 1, used.tokens);
  }

  for (const table of [task.estimatedCost, task.actualCost]) {
    if (!table) continue;
    for (const r of rollupCostTable(table).roles) {
      bump(agents, r.role, Math.max(1, r.agents), r.tokens);
    }
  }
}

function walkTasks(
  tasks: TaskEntry[],
  agents: Map<string, Accum>,
  skills: Map<string, Accum>,
): void {
  for (const task of tasks) {
    if (isRawEntry(task)) continue;
    ingestTask(task as TaskNode, agents, skills);
  }
}

function toSortedRows(
  map: Map<string, Accum>,
  dimension: LeaderboardDimension,
): LeaderboardRow[] {
  const entries = [...map.entries()].map(([name, acc]) => ({
    name,
    dimension,
    count: acc.count,
    tokens: acc.tokens,
    rank: 0,
  }));
  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    return a.name.localeCompare(b.name);
  });
  return entries.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/**
 * Per-agent / per-skill activity rankings.
 * Stable descending sort; empty → zero rows, header-safe shape (§4.7).
 */
export function computeLeaderboard(snapshot: Snapshot): LeaderboardResult {
  const agents = new Map<string, Accum>();
  const skills = new Map<string, Accum>();

  walkTasks(snapshot.tasks, agents, skills);

  for (const feature of snapshot.features) {
    if (isRawEntry(feature)) continue;
    for (const phase of (feature as FeatureNode).phases) {
      if (isRawEntry(phase)) continue;
      walkTasks((phase as FeaturePhase).tasks, agents, skills);
    }
  }

  if (!isRawEntry(snapshot.background)) {
    const reg = snapshot.background as BackgroundRegistry;
    for (const agent of reg.agents) {
      if (isRawEntry(agent) || ("raw" in agent && agent.raw === true)) continue;
      bump(agents, (agent as BackgroundAgent).id, 1, 0);
    }
  }

  const agentRows = toSortedRows(agents, "agent");
  const skillRows = toSortedRows(skills, "skill");
  const combined = [...agentRows, ...skillRows].map((r) => ({ ...r, rank: 0 }));
  combined.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    const dim = a.dimension.localeCompare(b.dimension);
    return dim !== 0 ? dim : a.name.localeCompare(b.name);
  });

  return {
    headers: HEADERS,
    rows: combined.map((row, idx) => ({ ...row, rank: idx + 1 })),
    agents: agentRows,
    skills: skillRows,
  };
}

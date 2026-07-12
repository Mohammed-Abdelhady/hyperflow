import type {
  FeatureEntry,
  FeatureNode,
  FeaturePhase,
  Snapshot,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/index.js";
import { isRawEntry } from "./parse-nodes.js";
import {
  rollupCostTable,
  tokensUsedFromStatus,
  type TokenRoleBucket,
} from "./token-parse.js";

export {
  parseTokenAmount,
  parseTokensUsedLine,
  rollupCostTable,
  tokensUsedFromStatus,
  type TokenRoleBucket,
} from "./token-parse.js";

export interface TokenChainBucket {
  chain: string;
  tokens: number;
  estimatedTokens: number;
  actualTokens: number;
  deltaTokens: number;
}

export interface TokenBatchBucket {
  batch: string;
  chain: string;
  tokens: number;
}

export interface TokenAgentBucket {
  agent: string;
  tokens: number;
  events: number;
}

export interface TokenSpendResult {
  totalTokens: number;
  estimatedTotal: number;
  actualTotal: number;
  deltaTokens: number;
  byRole: TokenRoleBucket[];
  byChain: TokenChainBucket[];
  byBatch: TokenBatchBucket[];
  byAgent: TokenAgentBucket[];
  empty: boolean;
}

function addRole(
  map: Map<string, TokenRoleBucket>,
  role: string,
  agents: number,
  tokens: number,
): void {
  const existing = map.get(role);
  if (existing) {
    existing.agents += agents;
    existing.tokens += tokens;
  } else {
    map.set(role, { role, agents, tokens });
  }
}

function addAgent(
  map: Map<string, TokenAgentBucket>,
  agent: string,
  tokens: number,
): void {
  const existing = map.get(agent);
  if (existing) {
    existing.tokens += tokens;
    existing.events += 1;
  } else {
    map.set(agent, { agent, tokens, events: 1 });
  }
}

function processTaskNode(
  task: TaskNode,
  roleMap: Map<string, TokenRoleBucket>,
  agentMap: Map<string, TokenAgentBucket>,
  chainMap: Map<string, TokenChainBucket>,
  batchBuckets: TokenBatchBucket[],
): void {
  const chain = task.slug;
  let estimated = 0;
  let actual = 0;

  if (task.estimatedCost) {
    const roll = rollupCostTable(task.estimatedCost);
    estimated = roll.totalTokens;
    for (const r of roll.roles) {
      addRole(roleMap, r.role, r.agents, r.tokens);
      addAgent(agentMap, r.role, r.tokens);
    }
  }

  if (task.actualCost) {
    const roll = rollupCostTable(task.actualCost);
    actual = roll.totalTokens;
    for (const r of roll.roles) {
      addRole(roleMap, r.role, r.agents, r.tokens);
      addAgent(agentMap, r.role, r.tokens);
    }
  }

  let usedTotal = 0;
  for (const u of tokensUsedFromStatus(task.statusFields)) {
    usedTotal += u.tokens;
    addRole(roleMap, u.role, 1, u.tokens);
    addAgent(agentMap, u.role, u.tokens);
  }

  for (const st of task.subTasks) {
    const agent = st.detail?.specialist ?? st.role;
    if (agent) addAgent(agentMap, agent, 0);
    if (st.label) batchBuckets.push({ batch: st.label, chain, tokens: 0 });
  }

  const primary = actual > 0 ? actual : estimated > 0 ? estimated : usedTotal;
  const existing = chainMap.get(chain);
  if (existing) {
    existing.tokens += primary;
    existing.estimatedTokens += estimated;
    existing.actualTokens += actual;
    existing.deltaTokens = existing.actualTokens - existing.estimatedTokens;
  } else {
    chainMap.set(chain, {
      chain,
      tokens: primary,
      estimatedTokens: estimated,
      actualTokens: actual,
      deltaTokens: actual - estimated,
    });
  }
}

function walkTasks(
  tasks: TaskEntry[],
  roleMap: Map<string, TokenRoleBucket>,
  agentMap: Map<string, TokenAgentBucket>,
  chainMap: Map<string, TokenChainBucket>,
  batchBuckets: TokenBatchBucket[],
): void {
  for (const task of tasks) {
    if (isRawEntry(task)) continue;
    processTaskNode(task as TaskNode, roleMap, agentMap, chainMap, batchBuckets);
  }
}

function walkFeatures(
  features: FeatureEntry[],
  roleMap: Map<string, TokenRoleBucket>,
  agentMap: Map<string, TokenAgentBucket>,
  chainMap: Map<string, TokenChainBucket>,
  batchBuckets: TokenBatchBucket[],
): void {
  for (const feature of features) {
    if (isRawEntry(feature)) continue;
    for (const phase of (feature as FeatureNode).phases) {
      if (isRawEntry(phase)) continue;
      walkTasks(
        (phase as FeaturePhase).tasks,
        roleMap,
        agentMap,
        chainMap,
        batchBuckets,
      );
    }
  }
}

/** Token-spend rollups over cost tables and Tokens-used lines. */
export function computeTokenSpend(snapshot: Snapshot): TokenSpendResult {
  const roleMap = new Map<string, TokenRoleBucket>();
  const agentMap = new Map<string, TokenAgentBucket>();
  const chainMap = new Map<string, TokenChainBucket>();
  const batchBuckets: TokenBatchBucket[] = [];

  walkTasks(snapshot.tasks, roleMap, agentMap, chainMap, batchBuckets);
  walkFeatures(snapshot.features, roleMap, agentMap, chainMap, batchBuckets);

  const byRole = [...roleMap.values()].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    return a.role.localeCompare(b.role);
  });
  const byChain = [...chainMap.values()].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    return a.chain.localeCompare(b.chain);
  });
  const byAgent = [...agentMap.values()].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    if (b.events !== a.events) return b.events - a.events;
    return a.agent.localeCompare(b.agent);
  });
  const byBatch = [...batchBuckets].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;
    const c = a.chain.localeCompare(b.chain);
    return c !== 0 ? c : a.batch.localeCompare(b.batch);
  });

  let estimatedTotal = 0;
  let actualTotal = 0;
  for (const c of byChain) {
    estimatedTotal += c.estimatedTokens;
    actualTotal += c.actualTokens;
  }

  const usedSum = byRole.reduce((s, r) => s + r.tokens, 0);
  const totalTokens =
    actualTotal > 0
      ? actualTotal
      : estimatedTotal > 0
        ? estimatedTotal
        : usedSum;

  return {
    totalTokens,
    estimatedTotal,
    actualTotal,
    deltaTokens: actualTotal - estimatedTotal,
    byRole,
    byChain,
    byBatch,
    byAgent,
    empty:
      estimatedTotal === 0 &&
      actualTotal === 0 &&
      usedSum === 0 &&
      byAgent.every((a) => a.tokens === 0),
  };
}

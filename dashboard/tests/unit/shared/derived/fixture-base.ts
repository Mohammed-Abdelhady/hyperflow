import type {
  GenericTable,
  ParseHealth,
  Snapshot,
  TaskNode,
} from "../../../../src/shared/schemas/index.js";

export const okHealth: ParseHealth = { state: "ok", diagnostics: [] };
export const errHealth: ParseHealth = {
  state: "parseError",
  diagnostics: [{ code: "PARSE_FAIL", message: "unparseable" }],
};

const emptyProgress = {
  done: 0,
  running: 0,
  pending: 0,
  total: 0,
} as const;

/** Minimal empty snapshot — every surface present, no content. */
export function emptySnapshot(): Snapshot {
  return {
    meta: { epoch: "e1", lastEventId: null, observeMode: false },
    tasks: [],
    features: [],
    specs: [],
    audits: [],
    memory: [],
    background: {
      agents: [],
      parseHealth: okHealth,
      present: false,
    },
    handoff: [],
    markers: { mode: null, sticky: false },
    commitsQueue: { present: false, items: [] },
    events: { present: false, reducedFidelity: true },
  };
}

export function costTableReviewerWorker(): GenericTable {
  return {
    headers: ["Role", "Agents", "Tokens"],
    rows: [
      { Role: "Reviewer", Agents: "16", Tokens: "~80k" },
      { Role: "Worker", Agents: "14", Tokens: "~140k" },
      { Role: "**Total**", Agents: "**30**", Tokens: "**~220k**" },
    ],
  };
}

export function costTableActual(): GenericTable {
  return {
    headers: ["Role", "Agents", "Tokens"],
    rows: [
      { Role: "Reviewer", Agents: "16", Tokens: "~90k" },
      { Role: "Worker", Agents: "14", Tokens: "~150k" },
      { Role: "Total", Agents: "30", Tokens: "~240k" },
    ],
  };
}

export function baseTask(
  overrides: Partial<TaskNode> & Pick<TaskNode, "slug" | "path">,
): TaskNode {
  return {
    path: overrides.path,
    slug: overrides.slug,
    format: overrides.format ?? "frontmatter",
    progress: overrides.progress ?? { ...emptyProgress },
    subTasks: overrides.subTasks ?? [],
    parseHealth: overrides.parseHealth ?? okHealth,
    ...(overrides.status !== undefined ? { status: overrides.status } : {}),
    ...(overrides.statusFields !== undefined
      ? { statusFields: overrides.statusFields }
      : {}),
    ...(overrides.objective !== undefined
      ? { objective: overrides.objective }
      : {}),
    ...(overrides.estimatedCost !== undefined
      ? { estimatedCost: overrides.estimatedCost }
      : {}),
    ...(overrides.actualCost !== undefined
      ? { actualCost: overrides.actualCost }
      : {}),
    ...(overrides.mtimeMs !== undefined ? { mtimeMs: overrides.mtimeMs } : {}),
  };
}

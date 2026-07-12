import type {
  AuditEntry,
  AuditNode,
  BackgroundRegistry,
  BackgroundSurface,
  FeatureEntry,
  FeatureNode,
  FeaturePhase,
  FeaturePhaseEntry,
  HandoffEntry,
  HandoffPackage,
  MemoryCategoryEntry,
  MemoryCategoryFile,
  ParseHealth,
  RawFallbackNode,
  Snapshot,
  SpecEntry,
  SpecNode,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/index.js";

export interface ParseObservation {
  ok: boolean;
  path: string;
  reason?: string;
  mtimeMs?: number;
}

/** Discriminate raw-fallback nodes across every artefact union. */
export function isRawEntry(entry: unknown): entry is RawFallbackNode {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "parseError" in entry &&
    (entry as { parseError?: unknown }).parseError === true
  );
}

function parseHealthOk(health: ParseHealth | undefined): boolean {
  if (!health) return true;
  return health.state === "ok" || health.state === "derived";
}

function observe(
  path: string,
  health: ParseHealth | undefined,
  mtimeMs: number | undefined,
): ParseObservation {
  const ok = parseHealthOk(health);
  const obs: ParseObservation = { ok, path };
  if (!ok) {
    const first = health?.diagnostics[0];
    if (first) obs.reason = first.message;
    else if (health?.state) obs.reason = health.state;
  }
  if (mtimeMs !== undefined) obs.mtimeMs = mtimeMs;
  return obs;
}

function rawObs(node: RawFallbackNode): ParseObservation {
  const obs: ParseObservation = { ok: false, path: node.path };
  if (node.reason !== undefined) obs.reason = node.reason;
  if (node.mtimeMs !== undefined) obs.mtimeMs = node.mtimeMs;
  return obs;
}

export function collectTaskParses(tasks: TaskEntry[]): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const task of tasks) {
    if (isRawEntry(task)) {
      out.push(rawObs(task));
      continue;
    }
    const node = task as TaskNode;
    out.push(observe(node.path, node.parseHealth, node.mtimeMs));
  }
  return out;
}

function collectPhaseParses(phases: FeaturePhaseEntry[]): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const phase of phases) {
    if (isRawEntry(phase)) {
      out.push(rawObs(phase));
      continue;
    }
    const node = phase as FeaturePhase;
    out.push(observe(node.path, node.parseHealth, undefined));
    out.push(...collectTaskParses(node.tasks));
  }
  return out;
}

export function collectFeatureParses(
  features: FeatureEntry[],
): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const feature of features) {
    if (isRawEntry(feature)) {
      out.push(rawObs(feature));
      continue;
    }
    const node = feature as FeatureNode;
    out.push(observe(node.path, node.parseHealth, node.mtimeMs));
    out.push(...collectPhaseParses(node.phases));
  }
  return out;
}

export function collectSpecParses(specs: SpecEntry[]): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const spec of specs) {
    if (isRawEntry(spec)) {
      out.push(rawObs(spec));
      continue;
    }
    const node = spec as SpecNode;
    out.push(observe(node.path, node.parseHealth, node.mtimeMs));
  }
  return out;
}

export function collectAuditParses(audits: AuditEntry[]): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const audit of audits) {
    if (isRawEntry(audit)) {
      out.push(rawObs(audit));
      continue;
    }
    const node = audit as AuditNode;
    out.push(observe(node.path, node.parseHealth, node.mtimeMs));
  }
  return out;
}

export function collectMemoryParses(
  memory: MemoryCategoryEntry[],
): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const cat of memory) {
    if (isRawEntry(cat)) {
      out.push(rawObs(cat));
      continue;
    }
    const node = cat as MemoryCategoryFile;
    out.push(observe(node.path, node.parseHealth, node.mtimeMs));
  }
  return out;
}

export function collectHandoffParses(
  handoff: HandoffEntry[],
): ParseObservation[] {
  const out: ParseObservation[] = [];
  for (const pkg of handoff) {
    if (isRawEntry(pkg)) {
      out.push(rawObs(pkg));
      continue;
    }
    const node = pkg as HandoffPackage;
    out.push(observe(node.path, node.parseHealth, node.mtimeMs));
  }
  return out;
}

export function collectBackgroundParses(
  bg: BackgroundSurface,
): ParseObservation[] {
  if (isRawEntry(bg)) {
    return [rawObs(bg)];
  }
  const reg = bg as BackgroundRegistry;
  const path = reg.path ?? "background/registry.json";
  return [observe(path, reg.parseHealth, undefined)];
}

export function collectAllParses(snapshot: Snapshot): ParseObservation[] {
  return [
    ...collectTaskParses(snapshot.tasks),
    ...collectFeatureParses(snapshot.features),
    ...collectSpecParses(snapshot.specs),
    ...collectAuditParses(snapshot.audits),
    ...collectMemoryParses(snapshot.memory),
    ...collectHandoffParses(snapshot.handoff),
    ...collectBackgroundParses(snapshot.background),
  ];
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function ratioOrOne(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return clamp01(numerator / denominator);
}

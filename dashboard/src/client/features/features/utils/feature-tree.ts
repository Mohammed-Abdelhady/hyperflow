import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  FeatureEntry,
  FeatureNode,
  FeaturePhase,
  FeaturePhaseEntry,
  ProgressCounts,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/index.js";

export interface FeatureListItem {
  slug: string;
  path: string;
  title: string;
  mtimeMs?: number;
  parseError: boolean;
  phaseCount: number;
}

export function orderPhases(
  phases: readonly FeaturePhaseEntry[],
): FeaturePhaseEntry[] {
  return [...phases].sort((a, b) => {
    if (isRawEntry(a) && isRawEntry(b)) return a.path.localeCompare(b.path);
    if (isRawEntry(a)) return 1;
    if (isRawEntry(b)) return -1;
    return (a as FeaturePhase).index - (b as FeaturePhase).index;
  });
}

export function progressPercent(progress: ProgressCounts | undefined): number {
  if (!progress || progress.total <= 0) return 0;
  const r = progress.done / progress.total;
  if (!Number.isFinite(r)) return 0;
  return Math.min(100, Math.max(0, Math.round(r * 100)));
}

export function formatDeps(deps: readonly string[]): string {
  if (deps.length === 0) return "—";
  return deps.join(", ");
}

export function featureToListItem(entry: FeatureEntry): FeatureListItem {
  if (isRawEntry(entry)) {
    return {
      slug: entry.path,
      path: entry.path,
      title: entry.path.split("/").pop() ?? entry.path,
      ...(entry.mtimeMs !== undefined ? { mtimeMs: entry.mtimeMs } : {}),
      parseError: true,
      phaseCount: 0,
    };
  }
  const node = entry as FeatureNode;
  return {
    slug: node.slug,
    path: node.path,
    title: node.name || node.slug,
    ...(node.mtimeMs !== undefined ? { mtimeMs: node.mtimeMs } : {}),
    parseError: false,
    phaseCount: node.phases.length,
  };
}

export function taskTitle(entry: TaskEntry): string {
  if (isRawEntry(entry)) return entry.path;
  const t = entry as TaskNode;
  return t.slug || t.objective || t.path;
}

export function taskSlug(entry: TaskEntry): string {
  if (isRawEntry(entry)) return entry.path;
  return (entry as TaskNode).slug;
}

export function findPhase(
  feature: FeatureNode,
  phaseKey: string,
): FeaturePhaseEntry | null {
  const ordered = orderPhases(feature.phases);
  for (const p of ordered) {
    if (isRawEntry(p)) {
      if (p.path === phaseKey || p.path.includes(phaseKey)) return p;
      continue;
    }
    const phase = p as FeaturePhase;
    if (
      phase.folder === phaseKey ||
      String(phase.index) === phaseKey ||
      phase.name === phaseKey
    ) {
      return p;
    }
  }
  return null;
}

export function findTask(
  phase: FeaturePhase,
  taskKey: string,
): TaskEntry | null {
  for (const t of phase.tasks) {
    if (taskSlug(t) === taskKey) return t;
  }
  return null;
}

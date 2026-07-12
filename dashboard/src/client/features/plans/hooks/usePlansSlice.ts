import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  PlanConclusion,
  ConclusionsResult,
} from "@shared/derived/index.js";
import type { TaskEntry, TaskNode } from "@shared/schemas/index.js";
import { useSnapshotSlice } from "../../../hooks/use-slice";
import {
  selectConclusions,
  selectTasks,
} from "../../../utils/selectors";

export interface PlanListItem {
  slug: string;
  path: string;
  title: string;
  mtimeMs?: number;
  status?: string;
  parseError: boolean;
  derived: boolean;
  progressDone: number;
  progressTotal: number;
}

function toListItem(entry: TaskEntry): PlanListItem {
  if (isRawEntry(entry)) {
    return {
      slug: entry.path,
      path: entry.path,
      title: entry.path.split("/").pop() ?? entry.path,
      ...(entry.mtimeMs !== undefined ? { mtimeMs: entry.mtimeMs } : {}),
      parseError: true,
      derived: false,
      progressDone: 0,
      progressTotal: 0,
    };
  }
  const node = entry as TaskNode;
  return {
    slug: node.slug,
    path: node.path,
    title: node.slug,
    ...(node.mtimeMs !== undefined ? { mtimeMs: node.mtimeMs } : {}),
    ...(node.status !== undefined ? { status: node.status } : {}),
    parseError: false,
    derived: node.parseHealth.state === "derived",
    progressDone: node.progress.done,
    progressTotal: node.progress.total,
  };
}

export function usePlansSlice() {
  const tasks = useSnapshotSlice((s) => selectTasks(s.data));
  const conclusions = useSnapshotSlice((s) => selectConclusions(s.data));

  const plans = useMemo(() => {
    const items = tasks.map(toListItem);
    items.sort((a, b) => {
      const am = a.mtimeMs ?? 0;
      const bm = b.mtimeMs ?? 0;
      return bm - am || a.slug.localeCompare(b.slug);
    });
    return items;
  }, [tasks]);

  const taskBySlug = useMemo(() => {
    const map = new Map<string, TaskEntry>();
    for (const t of tasks) {
      if (isRawEntry(t)) map.set(t.path, t);
      else map.set((t as TaskNode).slug, t);
    }
    return map;
  }, [tasks]);

  return {
    plans,
    taskBySlug,
    conclusions: conclusions as ConclusionsResult | null,
    empty: plans.length === 0,
  };
}

export function conclusionsForPlan(
  conclusions: ConclusionsResult | null,
  slug: string,
): PlanConclusion | undefined {
  return conclusions?.plans.find((p) => p.id === slug || p.title === slug);
}

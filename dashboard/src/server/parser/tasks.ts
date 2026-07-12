/**
 * Dual-format task file parser: frontmatter (task-tracking.md) and
 * terse-roster (artefact-format.md), plus checkbox-derived fallback.
 * Returns TaskEntry = TaskNode | RawFallback. Never throws.
 */

import type { ProgressCounts } from "@shared/schemas/common.js";
import type {
  SubTask,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/snapshot-artefacts.js";
import {
  extractRosterItems,
  frontmatterBody,
  parseFrontmatter,
  parseGenericTable,
  parseHealthDerived,
  parseHealthOk,
  parseStatusBlock,
  scanCheckboxes,
  withParseFallback,
  createRawFallback,
  extractH2Section,
  normalizeInput,
  diagnostic,
} from "./primitives/index.js";

export type ParseTaskOptions = {
  path: string;
  raw: string;
  slug?: string | undefined;
  mtimeMs?: number | undefined;
};

function slugFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function countsFromSubTasks(subTasks: SubTask[]): ProgressCounts {
  const progress: ProgressCounts = {
    done: 0,
    running: 0,
    pending: 0,
    total: 0,
  };
  for (const st of subTasks) {
    if (st.state === "done") progress.done += 1;
    else if (st.state === "running") progress.running += 1;
    else progress.pending += 1;
  }
  progress.total = progress.done + progress.running + progress.pending;
  return progress;
}

function subTasksFromRoster(raw: string): SubTask[] {
  return extractRosterItems(raw).map((item) => {
    const st: SubTask = {
      title: item.title,
      state: item.state,
    };
    if (item.taskId !== undefined) st.taskId = item.taskId;
    if (item.role !== undefined) st.role = item.role;
    if (item.detail !== undefined) st.detail = item.detail;
    if (item.taskId === undefined) st.label = item.title;
    return st;
  });
}

function subTasksFromSimpleCheckboxes(raw: string): SubTask[] {
  const section =
    extractH2Section(raw, "Sub-tasks") ??
    extractH2Section(raw, "Sub tasks") ??
    raw;
  const scan = scanCheckboxes(section);
  // Prefer items under Sub-tasks section if present
  const items =
    scan.sections.find((s) => /sub-?tasks/i.test(s.heading))?.items ??
    scan.items;
  return items.map((item) => {
    const parts = extractRosterItems(`- [${item.marker === "x" ? "x" : item.marker === "~" ? "~" : " "}] ${item.label}`);
    const first = parts[0];
    if (first && first.taskId) {
      const st: SubTask = {
        title: first.title,
        state: first.state,
        taskId: first.taskId,
      };
      if (first.role !== undefined) st.role = first.role;
      return st;
    }
    return { title: item.label, state: item.state, label: item.label };
  });
}

function parseFrontmatterTask(
  path: string,
  raw: string,
  slug: string,
  mtimeMs?: number,
): TaskNode | undefined {
  const fm = parseFrontmatter(raw);
  if (!fm.present) return undefined;
  // Require id or status key to treat as frontmatter shape
  if (!("id" in fm.fields) && !("status" in fm.fields)) return undefined;

  const body = frontmatterBody(raw, fm);
  const subTasks = subTasksFromSimpleCheckboxes(body);
  const progress = countsFromSubTasks(subTasks);
  const status = fm.fields["status"];

  const node: TaskNode = {
    path,
    slug,
    format: "frontmatter",
    progress,
    subTasks,
    parseHealth: parseHealthOk("frontmatter"),
  };
  if (status !== undefined) node.status = status;
  if (fm.fields["id"]) {
    // keep frontmatter id as statusFields-ish via statusFields optional
    node.statusFields = { ...fm.fields };
  } else if (Object.keys(fm.fields).length > 0) {
    node.statusFields = { ...fm.fields };
  }
  const objective = extractH2Section(body, "Objective");
  if (objective) node.objective = objective.split("\n")[0]?.trim();
  if (mtimeMs !== undefined) node.mtimeMs = mtimeMs;
  return node;
}

function parseRosterTask(
  path: string,
  raw: string,
  slug: string,
  mtimeMs?: number,
): TaskNode | undefined {
  const status = parseStatusBlock(raw);
  if (!status.present) return undefined;

  const subTasks = subTasksFromRoster(raw);
  let progress = countsFromSubTasks(subTasks);
  if (status.progress && subTasks.length === 0) {
    progress = {
      done: status.progress.done,
      total: status.progress.total,
      running: 0,
      pending: Math.max(0, status.progress.total - status.progress.done),
    };
  } else if (status.progress && subTasks.length > 0) {
    // Prefer live checkbox counts; status progress is secondary
    progress = countsFromSubTasks(subTasks);
  }

  const node: TaskNode = {
    path,
    slug,
    format: "roster",
    statusFields: status.fields,
    progress,
    subTasks,
    parseHealth: parseHealthOk(
      status.style === "keyline" ? "roster-keyline" : "roster-table",
      status.degraded
        ? [diagnostic("status-degraded", status.reason ?? "degraded")]
        : [],
    ),
  };
  if (status.fields["Status"]) node.status = status.fields["Status"];
  const plan = extractH2Section(raw, "Execution plan");
  if (plan) node.executionPlanRaw = plan;
  const est = extractH2Section(raw, "Estimated cost");
  if (est) {
    const table = parseGenericTable(est);
    if (table) node.estimatedCost = table;
  }
  const act = extractH2Section(raw, "Actual cost");
  if (act) {
    const table = parseGenericTable(act);
    if (table) node.actualCost = table;
  }
  if (mtimeMs !== undefined) node.mtimeMs = mtimeMs;
  return node;
}

function parseDerivedTask(
  path: string,
  raw: string,
  slug: string,
  mtimeMs?: number,
): TaskNode {
  const subTasks = subTasksFromSimpleCheckboxes(raw);
  const scan = scanCheckboxes(raw);
  const progress =
    subTasks.length > 0 ? countsFromSubTasks(subTasks) : scan.counts;

  const node: TaskNode = {
    path,
    slug,
    format: "derived",
    progress,
    subTasks,
    parseHealth: parseHealthDerived("checkbox-fallback", [
      diagnostic("derived", "No frontmatter or status block; counts from checkboxes"),
    ]),
  };
  if (mtimeMs !== undefined) node.mtimeMs = mtimeMs;
  return node;
}

function looksBinaryGarbage(raw: string): boolean {
  if (raw.length === 0) return false;
  let nonPrintable = 0;
  const sample = raw.slice(0, 512);
  for (let i = 0; i < sample.length; i += 1) {
    const c = sample.charCodeAt(i);
    if (c === 0 || (c < 9) || (c > 13 && c < 32)) nonPrintable += 1;
  }
  return nonPrintable > 0 && nonPrintable / sample.length > 0.05;
}

function parseTaskInner(opts: ParseTaskOptions): TaskEntry {
  const raw = normalizeInput(opts.raw);
  const path = opts.path;
  const slug = opts.slug ?? slugFromPath(path);
  const mtimeMs = opts.mtimeMs;

  if (looksBinaryGarbage(raw)) {
    return createRawFallback({
      path,
      raw,
      reason: "binary-or-garbage",
      mtimeMs,
      alreadyNormalized: true,
    });
  }

  // Torn mid-write: status table clearly incomplete
  const statusProbe = parseStatusBlock(raw);
  if (
    statusProbe.present &&
    statusProbe.degraded &&
    Object.keys(statusProbe.fields).length === 0
  ) {
    return createRawFallback({
      path,
      raw,
      reason: statusProbe.reason ?? "malformed-table",
      mtimeMs,
      alreadyNormalized: true,
    });
  }

  const fm = parseFrontmatterTask(path, raw, slug, mtimeMs);
  if (fm) return fm;

  const roster = parseRosterTask(path, raw, slug, mtimeMs);
  if (roster) return roster;

  // Checkbox-only derived
  const scan = scanCheckboxes(raw);
  if (scan.counts.total > 0 || raw.trim().length > 0) {
    return parseDerivedTask(path, raw, slug, mtimeMs);
  }

  return createRawFallback({
    path,
    raw,
    reason: "empty-or-unparseable",
    mtimeMs,
    alreadyNormalized: true,
  });
}

/** Parse one flat task markdown file. Never throws. */
export function parseTask(opts: ParseTaskOptions): TaskEntry {
  return withParseFallback(opts.path, opts.raw, () => parseTaskInner(opts), opts.mtimeMs);
}

/**
 * Feature-tree parser: feature.md + phase-N-slug/phase.md + nested briefs.
 * Operates on a provided file map — no filesystem IO. Never throws.
 */

import type {
  FeatureEntry,
  FeatureNode,
  FeaturePhase,
  FeaturePhaseEntry,
  TaskEntry,
} from "@shared/schemas/snapshot-artefacts.js";
import type { CheckboxState, ProgressCounts } from "@shared/schemas/common.js";
import {
  createRawFallback,
  diagnostic,
  extractH2Section,
  extractRosterItems,
  normalizeInput,
  parseHealthOk,
  parseStatusBlock,
  scanCheckboxes,
  withParseFallback,
} from "./primitives/index.js";
import { parseTask } from "./tasks.js";

export type FeatureFileMap = Record<string, string>;

export type ParseFeatureOptions = {
  /** Jail-relative feature root, e.g. `features/checkout-redesign`. */
  path: string;
  slug?: string;
  /** Paths relative to feature root → file contents. */
  files: FeatureFileMap;
  mtimeMs?: number;
};

function slugFromPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function parseDependsOn(text: string | undefined): string[] {
  if (!text) return [];
  // "phase-1-foundations" or "phase-1, phase-2" or "(depends on phase-1)"
  const cleaned = text.replace(/depends\s+on/gi, "").replace(/[()`]/g, "");
  return cleaned
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parsePhasesList(body: string): Array<{
  folder: string;
  goal?: string;
  status?: string;
  dependsOn: string[];
}> {
  const out: Array<{
    folder: string;
    goal?: string;
    status?: string;
    dependsOn: string[];
  }> = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    // 1. **phase-1-data-layer** — goal — `completed` (depends on phase-0)
    const m = t.match(
      /^\d+\.\s+\*\*(phase-\d+[^ *]*)\*\*(?:\s*[—–-]\s*(.*?))?(?:\s*[—–-]\s*`([^`]+)`)?(?:\s*\(([^)]*)\))?/,
    );
    if (!m?.[1]) continue;
    const entry: {
      folder: string;
      goal?: string;
      status?: string;
      dependsOn: string[];
    } = {
      folder: m[1],
      dependsOn: parseDependsOn(m[4]),
    };
    if (m[2]?.trim()) entry.goal = m[2].trim();
    if (m[3]?.trim()) entry.status = m[3].trim();
    out.push(entry);
  }
  return out;
}

function exitCriteria(raw: string): Array<{ label: string; state: CheckboxState }> {
  const section = extractH2Section(raw, "Exit criteria") ?? "";
  const scan = scanCheckboxes(section);
  return scan.items.map((i) => ({ label: i.label, state: i.state }));
}

function phaseIndexFromFolder(folder: string): number {
  const m = folder.match(/^phase-(\d+)/i);
  return m?.[1] ? Number.parseInt(m[1], 10) : 0;
}

function parsePhaseFile(
  featureRoot: string,
  folder: string,
  phaseRaw: string,
  files: FeatureFileMap,
): FeaturePhaseEntry {
  const path = `${featureRoot}/${folder}/phase.md`;
  return withParseFallback(path, phaseRaw, () => {
    const raw = normalizeInput(phaseRaw);
    const status = parseStatusBlock(raw);
    const roster = extractRosterItems(raw);
    const tasks: TaskEntry[] = [];

    for (const item of roster) {
      const pointer =
        item.pointer ??
        item.detail?.brief ??
        (item.taskId ? `tasks/${item.taskId}.md` : undefined);
      if (!pointer) continue;
      // Normalize pointer to path under phase folder
      const rel = pointer
        .replace(/^`|`$/g, "")
        .replace(/^\.\//, "");
      const briefKey = `${folder}/${rel}`;
      const altKey = Object.keys(files).find(
        (k) =>
          k === briefKey ||
          k.endsWith(`/${rel}`) ||
          (item.taskId !== undefined &&
            k.includes(`${folder}/tasks/`) &&
            k.includes(item.taskId)),
      );
      const content = files[briefKey] ?? (altKey ? files[altKey] : undefined);
      const briefPath = `${featureRoot}/${altKey ?? briefKey}`;
      if (content === undefined) {
        tasks.push(
          createRawFallback({
            path: briefPath,
            raw: "",
            reason: "brief-missing",
          }),
        );
        continue;
      }
      tasks.push(
        parseTask({
          path: briefPath,
          raw: content,
          slug: rel.replace(/\.md$/i, "").split("/").pop(),
        }),
      );
    }

    // Also pick up any tasks/* files not in roster
    const taskPrefix = `${folder}/tasks/`;
    for (const [key, content] of Object.entries(files)) {
      if (!key.startsWith(taskPrefix) || !key.endsWith(".md")) continue;
      const already = tasks.some((t) => {
        if ("path" in t) return t.path.endsWith(key) || t.path.endsWith(key.split("/").pop() ?? "");
        return false;
      });
      if (already) continue;
      tasks.push(
        parseTask({
          path: `${featureRoot}/${key}`,
          raw: content,
        }),
      );
    }

    let progress: ProgressCounts | undefined;
    if (status.present && status.progress) {
      progress = {
        done: status.progress.done,
        total: status.progress.total,
        running: 0,
        pending: Math.max(0, status.progress.total - status.progress.done),
      };
    }
    const rosterCounts = scanCheckboxes(raw).counts;
    if (!progress && rosterCounts.total > 0) progress = rosterCounts;

    const phase: FeaturePhase = {
      path,
      folder,
      index: phaseIndexFromFolder(folder),
      name: folder.replace(/^phase-\d+-?/, "") || folder,
      dependsOn: status.present
        ? parseDependsOn(status.fields["Depends on"])
        : [],
      tasks,
      exitCriteria: exitCriteria(raw),
      parseHealth: parseHealthOk(
        status.present ? status.style : "phase",
      ),
    };
    if (status.present) {
      phase.statusFields = status.fields;
      if (status.fields["Status"]) phase.status = status.fields["Status"];
    }
    if (progress) phase.progress = progress;
    return phase;
  });
}

function parseFeatureInner(opts: ParseFeatureOptions): FeatureEntry {
  const featureRoot = opts.path.replace(/\/$/, "");
  const slug = opts.slug ?? slugFromPath(featureRoot);
  const featureMd = opts.files["feature.md"];
  if (featureMd === undefined) {
    return createRawFallback({
      path: featureRoot,
      raw: "",
      reason: "missing-feature-md",
      mtimeMs: opts.mtimeMs,
    });
  }

  const raw = normalizeInput(featureMd);
  const status = parseStatusBlock(raw);
  const h1 = raw.match(/^#\s+Feature:\s*(.+)$/m);
  const name = h1?.[1]?.trim() ?? slug;

  const phasesSection = extractH2Section(raw, "Phases") ?? "";
  const listed = parsePhasesList(phasesSection);

  // Discover phase folders from file map
  const folderSet = new Set<string>();
  for (const key of Object.keys(opts.files)) {
    const m = key.match(/^(phase-\d+[^/]*)\//);
    if (m?.[1]) folderSet.add(m[1]);
  }
  for (const p of listed) folderSet.add(p.folder);

  const folders = [...folderSet].sort(
    (a, b) => phaseIndexFromFolder(a) - phaseIndexFromFolder(b),
  );

  const phases: FeaturePhaseEntry[] = [];
  for (const folder of folders) {
    const phaseRaw = opts.files[`${folder}/phase.md`];
    if (phaseRaw === undefined) {
      phases.push(
        createRawFallback({
          path: `${featureRoot}/${folder}/phase.md`,
          raw: "",
          reason: "missing-phase-md",
        }),
      );
      continue;
    }
    phases.push(parsePhaseFile(featureRoot, folder, phaseRaw, opts.files));
  }

  const graph = extractH2Section(raw, "Phase dependency graph");
  const goal = extractH2Section(raw, "Goal");

  const node: FeatureNode = {
    path: featureRoot,
    slug,
    name,
    phases,
    parseHealth: parseHealthOk(
      status.present ? status.style : "feature",
      status.present && status.degraded
        ? [diagnostic("status-degraded", status.reason ?? "degraded")]
        : [],
    ),
  };
  if (status.present) {
    node.statusFields = status.fields;
    if (status.fields["Status"]) node.status = status.fields["Status"];
  }
  if (goal) node.goal = goal.trim();
  if (graph) node.dependencyGraphRaw = graph;
  if (opts.mtimeMs !== undefined) node.mtimeMs = opts.mtimeMs;
  return node;
}

/** Parse one feature tree from an in-memory file map. Never throws. */
export function parseFeature(opts: ParseFeatureOptions): FeatureEntry {
  return withParseFallback(
    opts.path,
    opts.files["feature.md"] ?? "",
    () => parseFeatureInner(opts),
    opts.mtimeMs,
  );
}

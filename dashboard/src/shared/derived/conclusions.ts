import type {
  FeatureEntry,
  FeatureNode,
  FeaturePhase,
  ProgressCounts,
  Snapshot,
  SpecEntry,
  SpecNode,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/index.js";
import {
  normalizeStatus,
  progressRatio,
  progressSoFarText,
  statusFromProgress,
  type ConclusionStatus,
} from "./conclusion-status.js";
import { isRawEntry } from "./parse-nodes.js";

export type { ConclusionStatus } from "./conclusion-status.js";
export { progressSoFarText } from "./conclusion-status.js";

export interface EvidenceCitation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface ConclusionClaim {
  text: string;
  citations: EvidenceCitation[];
}

export interface PlanConclusion {
  id: string;
  title: string;
  status: ConclusionStatus;
  progressRatio: number;
  progress: ProgressCounts;
  claims: ConclusionClaim[];
  progressSoFar: string;
}

export interface ConclusionsResult {
  plans: PlanConclusion[];
  claimCount: number;
}

function cite(file: string, startLine: number, endLine: number): EvidenceCitation {
  const start = Math.max(1, startLine);
  return { file, startLine: start, endLine: Math.max(start, endLine) };
}

function ensureCitations(claim: ConclusionClaim): ConclusionClaim {
  if (claim.citations.length > 0) return claim;
  return { ...claim, citations: [cite("unknown", 1, 1)] };
}

function progressClaim(
  path: string,
  status: ConclusionStatus,
  progress: ProgressCounts,
): ConclusionClaim {
  return ensureCitations({
    text: progressSoFarText(status, progress),
    citations: [cite(path, 1, 1)],
  });
}

function claimsFromTask(task: TaskNode): ConclusionClaim[] {
  const claims: ConclusionClaim[] = [];
  const path = task.path;

  if (task.objective?.trim()) {
    claims.push(
      ensureCitations({
        text: task.objective.trim(),
        citations: [cite(path, 1, 1)],
      }),
    );
  }

  const done = task.subTasks.filter((s) => s.state === "done");
  if (done.length > 0) {
    const titles = done.map((s) => s.title).slice(0, 5);
    const more = done.length > 5 ? ` (+${done.length - 5} more)` : "";
    claims.push(
      ensureCitations({
        text: `Completed: ${titles.join("; ")}${more}`,
        citations: done.map((_, i) => cite(path, i + 2, i + 2)),
      }),
    );
  }

  task.subTasks.forEach((st, idx) => {
    if (st.state !== "running") return;
    const line = Math.max(2, idx + 2);
    claims.push(
      ensureCitations({
        text: `In progress: ${st.title}`,
        citations: [cite(path, line, line)],
      }),
    );
  });

  if (task.statusFields) {
    for (const [key, value] of Object.entries(task.statusFields)) {
      const k = key.trim().toLowerCase();
      if (k === "verdict" || k === "conclusion" || k === "result") {
        claims.push(
          ensureCitations({
            text: `${key}: ${value}`,
            citations: [cite(path, 1, 1)],
          }),
        );
      }
    }
  }

  return claims;
}

function conclusionFromTask(task: TaskNode): PlanConclusion {
  const status = statusFromProgress(
    task.progress,
    normalizeStatus(task.status),
  );
  const progress = task.progress;
  const claims = claimsFromTask(task);
  return {
    id: task.slug,
    title: task.slug,
    status,
    progressRatio: progressRatio(progress),
    progress: { ...progress },
    claims:
      claims.length > 0 ? claims : [progressClaim(task.path, status, progress)],
    progressSoFar: progressSoFarText(status, progress),
  };
}

function walkTasks(tasks: TaskEntry[]): PlanConclusion[] {
  const out: PlanConclusion[] = [];
  for (const task of tasks) {
    if (isRawEntry(task)) {
      out.push({
        id: task.path,
        title: task.path,
        status: "unknown",
        progressRatio: 0,
        progress: { done: 0, running: 0, pending: 0, total: 0 },
        claims: [
          ensureCitations({
            text: task.reason ?? "parse error — raw fallback",
            citations: [cite(task.path, 1, 1)],
          }),
        ],
        progressSoFar: "unparseable",
      });
      continue;
    }
    out.push(conclusionFromTask(task as TaskNode));
  }
  return out;
}

function walkFeatures(features: FeatureEntry[]): PlanConclusion[] {
  const out: PlanConclusion[] = [];
  for (const feature of features) {
    if (isRawEntry(feature)) continue;
    const feat = feature as FeatureNode;
    for (const phaseEntry of feat.phases) {
      if (isRawEntry(phaseEntry)) continue;
      const phase = phaseEntry as FeaturePhase;
      out.push(...walkTasks(phase.tasks));
      const progress = phase.progress ?? {
        done: 0,
        running: 0,
        pending: 0,
        total: 0,
      };
      const status = statusFromProgress(
        progress,
        normalizeStatus(phase.status),
      );
      out.push({
        id: `${feat.slug}/${phase.folder}`,
        title: phase.name,
        status,
        progressRatio: progressRatio(progress),
        progress: { ...progress },
        claims: [progressClaim(phase.path, status, progress)],
        progressSoFar: progressSoFarText(status, progress),
      });
    }
  }
  return out;
}

function walkSpecs(specs: SpecEntry[]): PlanConclusion[] {
  const out: PlanConclusion[] = [];
  for (const specEntry of specs) {
    if (isRawEntry(specEntry)) continue;
    const spec = specEntry as SpecNode;
    const total = spec.progressTotal ?? 0;
    const done = spec.progressDone ?? 0;
    const progress: ProgressCounts = {
      done,
      running: 0,
      pending: Math.max(0, total - done),
      total,
    };
    const status = statusFromProgress(progress, normalizeStatus(spec.status));
    const claims: ConclusionClaim[] = [];

    if (spec.tldr?.trim()) {
      const tldrSection = spec.sections.find(
        (s) =>
          s.text.toLowerCase().includes("tldr") ||
          s.text.toLowerCase().includes("tl;dr"),
      );
      claims.push(
        ensureCitations({
          text: spec.tldr.trim(),
          citations: [
            tldrSection
              ? cite(spec.path, tldrSection.startLine, tldrSection.endLine)
              : cite(spec.path, 1, 1),
          ],
        }),
      );
    }

    for (const section of spec.sections) {
      if (section.level > 2 || !section.text.trim()) continue;
      if (section.text.toLowerCase().startsWith("status")) continue;
      claims.push(
        ensureCitations({
          text: section.text.trim(),
          citations: [cite(spec.path, section.startLine, section.endLine)],
        }),
      );
    }

    out.push({
      id: spec.slug,
      title: spec.slug,
      status,
      progressRatio: progressRatio(progress),
      progress,
      claims:
        claims.length > 0
          ? claims
          : [progressClaim(spec.path, status, progress)],
      progressSoFar: progressSoFarText(status, progress),
    });
  }
  return out;
}

/** Plan conclusions with evidence citations. Pending plans never omitted (§4.7). */
export function computeConclusions(snapshot: Snapshot): ConclusionsResult {
  const plans = [
    ...walkTasks(snapshot.tasks),
    ...walkFeatures(snapshot.features),
    ...walkSpecs(snapshot.specs),
  ];
  const statusOrder: Record<ConclusionStatus, number> = {
    running: 0,
    pending: 1,
    completed: 2,
    unknown: 3,
  };
  plans.sort((a, b) => {
    const so = statusOrder[a.status] - statusOrder[b.status];
    return so !== 0 ? so : a.id.localeCompare(b.id);
  });
  return {
    plans,
    claimCount: plans.reduce((n, p) => n + p.claims.length, 0),
  };
}

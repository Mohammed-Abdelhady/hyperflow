/**
 * Surface loaders for snapshot assembly (read-only fs + parsers).
 */
import type {
  AuditEntry,
  FeatureEntry,
  MemoryCategoryEntry,
  SpecEntry,
  TaskEntry,
} from "@shared/schemas/snapshot-artefacts.js";
import type {
  BackgroundSurface,
  CommitsQueue,
  EventsPresence,
  HandoffEntry,
  Markers,
} from "@shared/schemas/snapshot-ops.js";
import { parseTask } from "../parser/tasks.js";
import { parseFeature } from "../parser/features.js";
import { parseMemory } from "../parser/memory.js";
import { parseAudit } from "../parser/audits.js";
import { parseSpec } from "../parser/specs.js";
import { parseHandoff } from "../parser/handoff.js";
import { parseBackground } from "../parser/background.js";
import {
  listDir,
  pathExists,
  readStat,
  readText,
  toPosixRel,
  walkFiles,
  joinRoot,
} from "./fs-read.js";

export function emptyMarkers(): Markers {
  return { mode: null, sticky: false };
}

export function emptyCommits(): CommitsQueue {
  return { present: false, items: [] };
}

export function emptyBackground(path?: string): BackgroundSurface {
  return {
    present: false,
    agents: [],
    parseHealth: { state: "ok", diagnostics: [] },
    ...(path !== undefined ? { path } : {}),
  };
}

export function emptyEvents(present: boolean, path?: string): EventsPresence {
  return {
    present,
    reducedFidelity: !present,
    ...(path !== undefined ? { path } : {}),
  };
}

export function loadTasks(hyperflowDir: string): TaskEntry[] {
  const tasksDir = joinRoot(hyperflowDir, "tasks");
  const out: TaskEntry[] = [];
  for (const abs of walkFiles(tasksDir, { extensions: [".md"] })) {
    const raw = readText(abs);
    if (raw === null) continue;
    const st = readStat(abs);
    const path = toPosixRel(hyperflowDir, abs);
    const opts: Parameters<typeof parseTask>[0] = { path, raw };
    if (st) opts.mtimeMs = st.mtimeMs;
    out.push(parseTask(opts));
  }
  return out;
}

export function loadFeatures(hyperflowDir: string): FeatureEntry[] {
  const featuresDir = joinRoot(hyperflowDir, "features");
  const out: FeatureEntry[] = [];
  if (!pathExists(featuresDir)) return out;

  for (const ent of listDir(featuresDir)) {
    if (!ent.isDirectory()) continue;
    const featureRoot = joinRoot(featuresDir, ent.name);
    const files: Record<string, string> = {};
    for (const abs of walkFiles(featureRoot)) {
      const raw = readText(abs);
      if (raw === null) continue;
      files[toPosixRel(featureRoot, abs)] = raw;
    }
    const st = readStat(featureRoot);
    const path = toPosixRel(hyperflowDir, featureRoot);
    const opts: Parameters<typeof parseFeature>[0] = { path, files };
    if (st) opts.mtimeMs = st.mtimeMs;
    out.push(parseFeature(opts));
  }
  return out;
}

export function loadMemory(hyperflowDir: string): MemoryCategoryEntry[] {
  const memDir = joinRoot(hyperflowDir, "memory");
  const out: MemoryCategoryEntry[] = [];
  for (const abs of walkFiles(memDir, { extensions: [".md"] })) {
    const base = abs.split(/[/\\]/).pop() ?? "";
    if (base === "index.md" || base === ".checksums") continue;
    const raw = readText(abs);
    if (raw === null) continue;
    const st = readStat(abs);
    const path = toPosixRel(hyperflowDir, abs);
    const opts: Parameters<typeof parseMemory>[0] = { path, raw };
    if (st) opts.mtimeMs = st.mtimeMs;
    out.push(parseMemory(opts));
  }
  return out;
}

export function loadAudits(hyperflowDir: string): AuditEntry[] {
  const dir = joinRoot(hyperflowDir, "audits");
  const out: AuditEntry[] = [];
  for (const abs of walkFiles(dir, { extensions: [".md"] })) {
    const raw = readText(abs);
    if (raw === null) continue;
    const st = readStat(abs);
    const path = toPosixRel(hyperflowDir, abs);
    const opts: Parameters<typeof parseAudit>[0] = { path, raw };
    if (st) opts.mtimeMs = st.mtimeMs;
    out.push(parseAudit(opts));
  }
  return out;
}

export function loadSpecs(hyperflowDir: string): SpecEntry[] {
  const dir = joinRoot(hyperflowDir, "specs");
  const out: SpecEntry[] = [];
  for (const abs of walkFiles(dir, { extensions: [".md"] })) {
    const raw = readText(abs);
    if (raw === null) continue;
    const st = readStat(abs);
    const path = toPosixRel(hyperflowDir, abs);
    const opts: Parameters<typeof parseSpec>[0] = { path, raw };
    if (st) opts.mtimeMs = st.mtimeMs;
    out.push(parseSpec(opts));
  }
  return out;
}

export function loadHandoff(handoffDir: string): HandoffEntry[] {
  const out: HandoffEntry[] = [];
  if (!pathExists(handoffDir)) return out;
  for (const ent of listDir(handoffDir)) {
    if (!ent.isDirectory()) continue;
    const pkgRoot = joinRoot(handoffDir, ent.name);
    const files: Record<string, string> = {};
    for (const name of ["HANDOFF.md", "STATUS", "COMPLETION.md"] as const) {
      const raw = readText(joinRoot(pkgRoot, name));
      if (raw !== null) files[name] = raw;
    }
    for (const abs of walkFiles(pkgRoot, { maxDepth: 6 })) {
      const rel = toPosixRel(pkgRoot, abs);
      if (files[rel] === undefined) {
        const raw = readText(abs);
        if (raw !== null) files[rel] = raw;
      }
    }
    const st = readStat(pkgRoot);
    const opts: Parameters<typeof parseHandoff>[0] = {
      path: ent.name,
      files,
      slug: ent.name,
    };
    if (st) opts.mtimeMs = st.mtimeMs;
    out.push(parseHandoff(opts));
  }
  return out;
}

export function loadBackground(hyperflowDir: string): BackgroundSurface {
  const path = "background/registry.json";
  const abs = joinRoot(hyperflowDir, path);
  if (!pathExists(abs)) return emptyBackground(path);
  const raw = readText(abs);
  return parseBackground({ path, raw });
}

export function loadMarkers(hyperflowDir: string): Markers {
  const modeAbs = joinRoot(hyperflowDir, ".mode");
  const stickyAbs = joinRoot(hyperflowDir, ".sticky");
  const modeRaw = readText(modeAbs);
  const stickyRaw = readText(stickyAbs);
  const markers: Markers = {
    mode: modeRaw !== null ? modeRaw.trim() || null : null,
    sticky: stickyRaw !== null && stickyRaw.trim().length > 0,
  };
  if (pathExists(modeAbs)) markers.modePath = ".mode";
  if (pathExists(stickyAbs)) markers.stickyPath = ".sticky";
  return markers;
}

export function loadCommitsQueue(hyperflowDir: string): CommitsQueue {
  const rel = "commits-queue.json";
  const abs = joinRoot(hyperflowDir, rel);
  if (!pathExists(abs)) return emptyCommits();
  const raw = readText(abs);
  if (raw === null) return { present: true, path: rel, items: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    const items = Array.isArray(parsed)
      ? parsed.map((item, i) => ({ id: String(i), raw: item }))
      : [{ raw: parsed }];
    return { present: true, path: rel, items, raw };
  } catch {
    return {
      present: true,
      path: rel,
      items: [],
      raw,
      parseHealth: {
        state: "parseError",
        diagnostics: [{ code: "json", message: "invalid commits queue" }],
      },
    };
  }
}

export function loadEventsPresence(hyperflowDir: string): EventsPresence {
  const rel = "events.ndjson";
  const abs = joinRoot(hyperflowDir, rel);
  if (!pathExists(abs)) return emptyEvents(false, rel);
  const st = readStat(abs);
  return {
    present: true,
    path: rel,
    reducedFidelity: false,
    ...(st ? { byteLength: st.size } : {}),
  };
}

export type SnapshotRoots = {
  hyperflowDir: string;
  handoffDir: string;
  globalConfigPath: string;
};

export function classifyPath(
  abs: string,
  roots: SnapshotRoots,
): { surface: string; rel: string } | null {
  const { hyperflowDir, handoffDir } = roots;
  if (abs.startsWith(hyperflowDir)) {
    const rel = toPosixRel(hyperflowDir, abs);
    if (rel.startsWith("tasks/")) return { surface: "tasks", rel };
    if (rel.startsWith("features/")) return { surface: "features", rel };
    if (rel.startsWith("memory/")) return { surface: "memory", rel };
    if (rel.startsWith("audits/")) return { surface: "audits", rel };
    if (rel.startsWith("specs/")) return { surface: "specs", rel };
    if (rel === "background/registry.json" || rel.startsWith("background/")) {
      return { surface: "background", rel };
    }
    if (rel === ".mode" || rel === ".sticky") return { surface: "markers", rel };
    if (rel === "commits-queue.json") return { surface: "commitsQueue", rel };
    if (rel === "events.ndjson") return { surface: "events", rel };
    return { surface: "other", rel };
  }
  if (abs.startsWith(handoffDir)) {
    return { surface: "handoff", rel: toPosixRel(handoffDir, abs) };
  }
  return null;
}

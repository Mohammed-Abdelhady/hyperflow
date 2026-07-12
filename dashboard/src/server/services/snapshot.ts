/**
 * Snapshot assembly: fan-out parsers → cached normalized snapshot.
 * Incremental refresh re-parses only changed paths.
 */
import type { Snapshot, SnapshotMeta } from "@shared/schemas/snapshot.js";
import type { SnapshotDelta } from "@shared/schemas/delta.js";
import type { IntegrityEntry } from "../watch/integrity.js";
import { diffSnapshots } from "./delta.js";
import {
  classifyPath,
  loadAudits,
  loadBackground,
  loadCommitsQueue,
  loadEventsPresence,
  loadFeatures,
  loadHandoff,
  loadMarkers,
  loadMemory,
  loadSpecs,
  loadTasks,
  type SnapshotRoots,
} from "./snapshot-load.js";

export type { SnapshotRoots };

export type SnapshotServiceOptions = {
  roots: SnapshotRoots;
  meta?: Partial<SnapshotMeta> | undefined;
};

export type SnapshotService = {
  assemble: () => Snapshot;
  getCached: () => Snapshot | null;
  applyChangeset: (entries: IntegrityEntry[]) => {
    snapshot: Snapshot;
    delta: SnapshotDelta;
  };
  setMeta: (patch: Partial<SnapshotMeta>) => Snapshot;
};

function defaultMeta(partial?: Partial<SnapshotMeta>): SnapshotMeta {
  return {
    epoch: partial?.epoch ?? 0,
    lastEventId: partial?.lastEventId ?? null,
    observeMode: partial?.observeMode ?? false,
    ...(partial?.generatedAt !== undefined
      ? { generatedAt: partial.generatedAt }
      : { generatedAt: new Date().toISOString() }),
  };
}

export function createSnapshotService(
  options: SnapshotServiceOptions,
): SnapshotService {
  const { roots } = options;
  let cached: Snapshot | null = null;
  let meta = defaultMeta(options.meta);

  function assemble(): Snapshot {
    const snapshot: Snapshot = {
      meta: {
        ...meta,
        generatedAt: new Date().toISOString(),
      },
      tasks: loadTasks(roots.hyperflowDir),
      features: loadFeatures(roots.hyperflowDir),
      specs: loadSpecs(roots.hyperflowDir),
      audits: loadAudits(roots.hyperflowDir),
      memory: loadMemory(roots.hyperflowDir),
      background: loadBackground(roots.hyperflowDir),
      handoff: loadHandoff(roots.handoffDir),
      markers: loadMarkers(roots.hyperflowDir),
      commitsQueue: loadCommitsQueue(roots.hyperflowDir),
      events: loadEventsPresence(roots.hyperflowDir),
    };
    cached = snapshot;
    return snapshot;
  }

  function getCached(): Snapshot | null {
    return cached;
  }

  function setMeta(patch: Partial<SnapshotMeta>): Snapshot {
    meta = { ...meta, ...patch };
    if (!cached) return assemble();
    cached = { ...cached, meta: { ...cached.meta, ...patch } };
    return cached;
  }

  function applyChangeset(entries: IntegrityEntry[]): {
    snapshot: Snapshot;
    delta: SnapshotDelta;
  } {
    const prev = cached ?? assemble();
    if (entries.length === 0) {
      return { snapshot: prev, delta: { ops: [] } };
    }

    const surfaces = new Set(
      entries
        .map((e) => classifyPath(e.path, roots)?.surface)
        .filter((s): s is string => s !== undefined && s !== "other"),
    );

    const next: Snapshot = {
      ...prev,
      meta: { ...prev.meta, generatedAt: new Date().toISOString() },
    };

    if (surfaces.has("tasks")) next.tasks = loadTasks(roots.hyperflowDir);
    if (surfaces.has("features")) {
      next.features = loadFeatures(roots.hyperflowDir);
    }
    if (surfaces.has("memory")) next.memory = loadMemory(roots.hyperflowDir);
    if (surfaces.has("audits")) next.audits = loadAudits(roots.hyperflowDir);
    if (surfaces.has("specs")) next.specs = loadSpecs(roots.hyperflowDir);
    if (surfaces.has("handoff")) next.handoff = loadHandoff(roots.handoffDir);
    if (surfaces.has("background")) {
      next.background = loadBackground(roots.hyperflowDir);
    }
    if (surfaces.has("markers")) next.markers = loadMarkers(roots.hyperflowDir);
    if (surfaces.has("commitsQueue")) {
      next.commitsQueue = loadCommitsQueue(roots.hyperflowDir);
    }
    if (surfaces.has("events")) {
      next.events = loadEventsPresence(roots.hyperflowDir);
    }

    const delta = diffSnapshots(prev, next);
    cached = next;
    return { snapshot: next, delta };
  }

  return { assemble, getCached, applyChangeset, setMeta };
}

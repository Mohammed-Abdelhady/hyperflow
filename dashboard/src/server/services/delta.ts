/**
 * Structural snapshot diff → typed delta ops (id-less; hub assigns ids).
 */
import type { Snapshot } from "@shared/schemas/snapshot.js";
import type {
  DeltaSurface,
  SnapshotDelta,
  SnapshotDeltaOp,
} from "@shared/schemas/delta.js";
import type { RawFallbackNode } from "@shared/schemas/common.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function entityId(surface: DeltaSurface, entity: unknown, index: number): string {
  if (!isRecord(entity)) return `${surface}:${index}`;
  if (typeof entity["path"] === "string" && entity["path"].length > 0) {
    return entity["path"];
  }
  if (typeof entity["slug"] === "string" && entity["slug"].length > 0) {
    return entity["slug"];
  }
  if (typeof entity["category"] === "string") return entity["category"];
  if (typeof entity["id"] === "string") return entity["id"];
  return `${surface}:${index}`;
}

function stableKey(value: unknown): string {
  return JSON.stringify(value);
}

function isFallback(v: unknown): v is RawFallbackNode {
  return isRecord(v) && v["parseError"] === true;
}

function indexById(
  surface: DeltaSurface,
  list: readonly unknown[],
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  list.forEach((entity, i) => {
    map.set(entityId(surface, entity, i), entity);
  });
  return map;
}

function diffList(
  surface: DeltaSurface,
  prev: readonly unknown[],
  next: readonly unknown[],
): SnapshotDeltaOp[] {
  const ops: SnapshotDeltaOp[] = [];
  const prevMap = indexById(surface, prev);
  const nextMap = indexById(surface, next);

  for (const [id, entity] of nextMap) {
    if (!prevMap.has(id)) {
      ops.push({ op: "add", surface, id, entity: entity as SnapshotDeltaOp["entity"] });
    } else if (stableKey(prevMap.get(id)) !== stableKey(entity)) {
      ops.push({
        op: "update",
        surface,
        id,
        entity: entity as SnapshotDeltaOp["entity"],
      });
    }
  }
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      ops.push({ op: "remove", surface, id });
    }
  }
  return ops;
}

function diffScalar(
  surface: DeltaSurface,
  id: string,
  prev: unknown,
  next: unknown,
): SnapshotDeltaOp[] {
  if (stableKey(prev) === stableKey(next)) return [];
  if (prev === undefined || prev === null) {
    return [
      {
        op: "add",
        surface,
        id,
        entity: next as SnapshotDeltaOp["entity"],
      },
    ];
  }
  if (next === undefined || next === null) {
    return [{ op: "remove", surface, id }];
  }
  return [
    {
      op: "update",
      surface,
      id,
      entity: next as SnapshotDeltaOp["entity"],
    },
  ];
}

/**
 * Diff previous vs next snapshot. Identical snapshots → empty ops.
 * Granularity is per surface entity (never whole-surface replace on single edit).
 */
export function diffSnapshots(previous: Snapshot, next: Snapshot): SnapshotDelta {
  const ops: SnapshotDeltaOp[] = [
    ...diffList("tasks", previous.tasks, next.tasks),
    ...diffList("features", previous.features, next.features),
    ...diffList("specs", previous.specs, next.specs),
    ...diffList("audits", previous.audits, next.audits),
    ...diffList("memory", previous.memory, next.memory),
    ...diffList("handoff", previous.handoff, next.handoff),
    ...diffScalar("background", "background", previous.background, next.background),
    ...diffScalar("markers", "markers", previous.markers, next.markers),
    ...diffScalar(
      "commitsQueue",
      "commitsQueue",
      previous.commitsQueue,
      next.commitsQueue,
    ),
    ...diffScalar("events", "events", previous.events, next.events),
    ...diffScalar("meta", "meta", previous.meta, next.meta),
  ];

  // Fallbacks are first-class members of list surfaces already.
  void isFallback;
  return { ops };
}

export function isEmptyDelta(delta: SnapshotDelta): boolean {
  return delta.ops.length === 0;
}

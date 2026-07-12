import type {
  DeltaEntity,
  DeltaSurface,
  Snapshot,
  SnapshotDelta,
  SnapshotDeltaOp,
  WriteEchoPayload,
} from "@shared/schemas/index.js";
import type { RawFallbackNode } from "@shared/schemas/common.js";

export interface OptimisticEntry {
  writeId: string;
  surface: DeltaSurface;
  id: string;
  entity?: DeltaEntity;
}

export interface ApplyDeltaResult {
  snapshot: Snapshot;
  unknownOps: number;
}

function isRawFallback(entity: unknown): entity is RawFallbackNode {
  return (
    typeof entity === "object" &&
    entity !== null &&
    "parseError" in entity &&
    (entity as RawFallbackNode).parseError === true
  );
}

function entityKey(entity: DeltaEntity, fallbackId: string): string {
  if (isRawFallback(entity)) return entity.path || fallbackId;
  if (typeof entity === "object" && entity !== null) {
    const rec = entity as Record<string, unknown>;
    if (typeof rec["slug"] === "string") return rec["slug"];
    if (typeof rec["path"] === "string") return rec["path"];
    if (typeof rec["category"] === "string") return rec["category"];
    if (typeof rec["id"] === "string") return rec["id"];
  }
  return fallbackId;
}

type ArraySurface =
  | "tasks"
  | "features"
  | "specs"
  | "audits"
  | "memory"
  | "handoff";

const ARRAY_SURFACES: readonly ArraySurface[] = [
  "tasks",
  "features",
  "specs",
  "audits",
  "memory",
  "handoff",
] as const;

function applyArrayOp(
  list: DeltaEntity[],
  op: SnapshotDeltaOp,
): DeltaEntity[] {
  const id = op.id;
  switch (op.op) {
    case "remove":
      return list.filter((item) => entityKey(item, id) !== id);
    case "add": {
      if (op.entity === undefined) return list;
      const without = list.filter((item) => entityKey(item, id) !== id);
      return [...without, op.entity];
    }
    case "update":
    case "replace": {
      if (op.entity === undefined) return list;
      const idx = list.findIndex((item) => entityKey(item, id) === id);
      if (idx < 0) return [...list, op.entity];
      const next = list.slice();
      next[idx] = op.entity;
      return next;
    }
    default:
      return list;
  }
}

function applyScalarSurface(
  snapshot: Snapshot,
  op: SnapshotDeltaOp,
): Snapshot | null {
  if (op.entity === undefined && op.op !== "remove") return snapshot;
  switch (op.surface) {
    case "background":
      if (op.entity === undefined) return snapshot;
      return { ...snapshot, background: op.entity as Snapshot["background"] };
    case "markers":
      if (op.entity === undefined) return snapshot;
      return { ...snapshot, markers: op.entity as Snapshot["markers"] };
    case "commitsQueue":
      if (op.entity === undefined) return snapshot;
      return {
        ...snapshot,
        commitsQueue: op.entity as Snapshot["commitsQueue"],
      };
    case "events":
      if (op.entity === undefined) return snapshot;
      return { ...snapshot, events: op.entity as Snapshot["events"] };
    case "meta":
      if (op.entity === undefined) return snapshot;
      return {
        ...snapshot,
        meta: {
          ...snapshot.meta,
          ...(op.entity as Partial<Snapshot["meta"]>),
        },
      };
    default:
      return null;
  }
}

/** Pure: apply a typed snapshot-delta to snapshot data. */
export function applySnapshotDelta(
  snapshot: Snapshot,
  delta: SnapshotDelta,
): ApplyDeltaResult {
  let next = snapshot;
  let unknownOps = 0;

  for (const op of delta.ops) {
    if (!(ARRAY_SURFACES as readonly string[]).includes(op.surface)) {
      const scalar = applyScalarSurface(next, op);
      if (scalar === null) {
        unknownOps += 1;
        continue;
      }
      next = scalar;
      continue;
    }

    const surface = op.surface as ArraySurface;
    const list = next[surface] as DeltaEntity[];
    const updated = applyArrayOp(list, op);
    next = { ...next, [surface]: updated };
  }

  return { snapshot: next, unknownOps };
}

/** Reconcile write-echo: replace optimistic match or apply as external delta. */
export function applyWriteEchoToSnapshot(
  snapshot: Snapshot,
  optimistic: OptimisticEntry[],
  echo: WriteEchoPayload,
): { snapshot: Snapshot; optimistic: OptimisticEntry[]; unknownOps: number } {
  const remaining = optimistic.filter((o) => o.writeId !== echo.writeId);
  const matched = remaining.length !== optimistic.length;

  if (echo.delta) {
    const applied = applySnapshotDelta(snapshot, echo.delta);
    return {
      snapshot: applied.snapshot,
      optimistic: matched ? remaining : optimistic,
      unknownOps: applied.unknownOps,
    };
  }

  return {
    snapshot,
    optimistic: matched ? remaining : optimistic,
    unknownOps: 0,
  };
}

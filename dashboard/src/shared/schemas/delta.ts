import { z } from "zod";
import { RawFallbackNodeSchema } from "./common.js";
import {
  AuditEntrySchema,
  FeatureEntrySchema,
  MemoryCategoryEntrySchema,
  SpecEntrySchema,
  TaskEntrySchema,
} from "./snapshot-artefacts.js";
import {
  BackgroundSurfaceSchema,
  CommitsQueueSchema,
  EventsPresenceSchema,
  HandoffEntrySchema,
  MarkersSchema,
} from "./snapshot-ops.js";

// ── SSE named-event vocabulary (spec §3B.13) ───────────────────────────

export const SSE_EVENT_NAMES = {
  SNAPSHOT_DELTA: "snapshot-delta",
  HF_EVENT: "hf-event",
  WRITE_ECHO: "write-echo",
  RESYNC_REQUIRED: "resync-required",
} as const;

export type SseEventName =
  (typeof SSE_EVENT_NAMES)[keyof typeof SSE_EVENT_NAMES];

export const SseEventNameSchema = z.enum([
  SSE_EVENT_NAMES.SNAPSHOT_DELTA,
  SSE_EVENT_NAMES.HF_EVENT,
  SSE_EVENT_NAMES.WRITE_ECHO,
  SSE_EVENT_NAMES.RESYNC_REQUIRED,
]);

/** Heartbeat is an SSE comment frame, not a named event — documented only. */
export const SSE_HEARTBEAT_KIND = "heartbeat" as const;

// ── Epoch-seq id format: `<epoch>-<seq>` ───────────────────────────────

/** Matches server-minted SSE ids: non-empty epoch token, hyphen, non-neg seq. */
export const EPOCH_SEQ_ID_PATTERN = /^[A-Za-z0-9_-]+-\d+$/;

export const EpochSeqIdSchema = z
  .string()
  .regex(EPOCH_SEQ_ID_PATTERN, "expected <epoch>-<seq> id");
export type EpochSeqId = z.infer<typeof EpochSeqIdSchema>;

export function parseEpochSeqId(
  id: string,
): { epoch: string; seq: number } | null {
  const match = /^([A-Za-z0-9_-]+)-(\d+)$/.exec(id);
  if (!match) return null;
  const epoch = match[1];
  const seqRaw = match[2];
  if (epoch === undefined || seqRaw === undefined) return null;
  return { epoch, seq: Number(seqRaw) };
}

export function formatEpochSeqId(epoch: string | number, seq: number): string {
  return `${epoch}-${seq}`;
}

// ── Snapshot-delta surfaces + entities ─────────────────────────────────

export const DeltaSurfaceSchema = z.enum([
  "tasks",
  "features",
  "specs",
  "audits",
  "memory",
  "background",
  "handoff",
  "markers",
  "commitsQueue",
  "events",
  "meta",
]);
export type DeltaSurface = z.infer<typeof DeltaSurfaceSchema>;

/**
 * Entity payload for a single surface entry.
 * Raw-fallback nodes with `parseError: true` are first-class members.
 */
export const DeltaEntitySchema = z.union([
  TaskEntrySchema,
  FeatureEntrySchema,
  SpecEntrySchema,
  AuditEntrySchema,
  MemoryCategoryEntrySchema,
  BackgroundSurfaceSchema,
  HandoffEntrySchema,
  MarkersSchema,
  CommitsQueueSchema,
  EventsPresenceSchema,
  RawFallbackNodeSchema,
  z.record(z.string(), z.unknown()),
]);
export type DeltaEntity = z.infer<typeof DeltaEntitySchema>;

export const DeltaOpKindSchema = z.enum(["add", "update", "remove", "replace"]);
export type DeltaOpKind = z.infer<typeof DeltaOpKindSchema>;

export const SnapshotDeltaOpSchema = z.object({
  op: DeltaOpKindSchema,
  surface: DeltaSurfaceSchema,
  /** Entity key within the surface (slug, path, category, or sentinel). */
  id: z.string(),
  entity: DeltaEntitySchema.optional(),
});
export type SnapshotDeltaOp = z.infer<typeof SnapshotDeltaOpSchema>;

/**
 * Typed snapshot-delta patch list carried over SSE as `snapshot-delta`.
 * Hub assigns id; deltas leave the service layer id-less (T13).
 */
export const SnapshotDeltaSchema = z.object({
  ops: z.array(SnapshotDeltaOpSchema),
});
export type SnapshotDelta = z.infer<typeof SnapshotDeltaSchema>;

/** SSE `write-echo` payload — writeId correlates optimistic client mutation. */
export const WriteEchoPayloadSchema = z.object({
  writeId: z.string(),
  surface: DeltaSurfaceSchema.optional(),
  path: z.string().optional(),
  delta: SnapshotDeltaSchema.optional(),
});
export type WriteEchoPayload = z.infer<typeof WriteEchoPayloadSchema>;

/** SSE `resync-required` payload. */
export const ResyncRequiredPayloadSchema = z.object({
  reason: z.enum(["epoch-mismatch", "buffer-overflow", "manual", "unknown"]),
  message: z.string().optional(),
});
export type ResyncRequiredPayload = z.infer<typeof ResyncRequiredPayloadSchema>;

import { z } from "zod";
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

export * from "./common.js";
export * from "./snapshot-artefacts.js";
export * from "./snapshot-ops.js";

/**
 * Snapshot wire meta — epoch + last-event-id for SSE resume (spec §2a, T16).
 * `observeMode` is set by the server factory when the jail root is read-only.
 */
export const SnapshotMetaSchema = z.object({
  epoch: z.union([z.string(), z.number()]),
  lastEventId: z.string().nullable(),
  observeMode: z.boolean().default(false),
  generatedAt: z.string().optional(),
});
export type SnapshotMeta = z.infer<typeof SnapshotMetaSchema>;

/**
 * Full normalized snapshot covering every artefact surface.
 * Hydrates Zustand on GET /api/v1/snapshot; deltas patch this shape.
 */
export const SnapshotSchema = z.object({
  meta: SnapshotMetaSchema,
  tasks: z.array(TaskEntrySchema),
  features: z.array(FeatureEntrySchema),
  specs: z.array(SpecEntrySchema),
  audits: z.array(AuditEntrySchema),
  memory: z.array(MemoryCategoryEntrySchema),
  background: BackgroundSurfaceSchema,
  handoff: z.array(HandoffEntrySchema),
  markers: MarkersSchema,
  commitsQueue: CommitsQueueSchema,
  events: EventsPresenceSchema,
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

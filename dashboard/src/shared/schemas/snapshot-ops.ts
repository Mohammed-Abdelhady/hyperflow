import { z } from "zod";
import {
  ArtefactPathSchema,
  ParseHealthSchema,
  RawFallbackNodeSchema,
  StatusFieldMapSchema,
} from "./common.js";

// ── Background registry ────────────────────────────────────────────────

export const BackgroundAgentStatusSchema = z.string();
export type BackgroundAgentStatus = z.infer<typeof BackgroundAgentStatusSchema>;

export const BackgroundStatusClassSchema = z.enum([
  "in-flight",
  "completed",
  "stalled",
  "errored",
  "cancelled",
  "unknown",
]);
export type BackgroundStatusClass = z.infer<typeof BackgroundStatusClassSchema>;

export const BackgroundAgentSchema = z.object({
  id: z.string(),
  purpose: z.string().optional(),
  fired_at: z.string().optional(),
  timeout_at: z.string().optional(),
  status: BackgroundAgentStatusSchema,
  statusClass: BackgroundStatusClassSchema.default("unknown"),
  output_buffer: z.string().optional(),
  outputBufferExists: z.boolean().optional(),
  blocks_step: z.union([z.string(), z.null()]).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type BackgroundAgent = z.infer<typeof BackgroundAgentSchema>;

export const BackgroundRawEntrySchema = z.object({
  raw: z.literal(true),
  data: z.unknown(),
  reason: z.string().optional(),
});
export type BackgroundRawEntry = z.infer<typeof BackgroundRawEntrySchema>;

export const BackgroundAgentEntrySchema = z.union([
  BackgroundAgentSchema,
  BackgroundRawEntrySchema,
]);
export type BackgroundAgentEntry = z.infer<typeof BackgroundAgentEntrySchema>;

export const BackgroundRegistrySchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema.optional(),
  agents: z.array(BackgroundAgentEntrySchema),
  parseHealth: ParseHealthSchema,
  present: z.boolean(),
  raw: z.string().optional(),
});
export type BackgroundRegistry = z.infer<typeof BackgroundRegistrySchema>;

export const BackgroundSurfaceSchema = z.union([
  BackgroundRegistrySchema,
  RawFallbackNodeSchema,
]);
export type BackgroundSurface = z.infer<typeof BackgroundSurfaceSchema>;

// ── Handoff packages ───────────────────────────────────────────────────

export const HandoffStatusSchema = z.enum([
  "planned",
  "built",
  "reviewed",
  "unknown",
]);
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;

export const HandoffCompletionSchema = z.object({
  present: z.boolean(),
  fields: StatusFieldMapSchema.optional(),
  result: z.enum(["built", "partial"]).optional(),
  done: z.number().int().optional(),
  total: z.number().int().optional(),
  notes: z.string().optional(),
  raw: z.string().optional(),
});
export type HandoffCompletion = z.infer<typeof HandoffCompletionSchema>;

export const HandoffPackageSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  slug: z.string(),
  status: HandoffStatusSchema,
  statusRaw: z.string().optional(),
  manifest: StatusFieldMapSchema.optional(),
  tldr: z.string().optional(),
  completion: HandoffCompletionSchema,
  members: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
  parseHealth: ParseHealthSchema,
  mtimeMs: z.number().optional(),
  raw: z.string().optional(),
});
export type HandoffPackage = z.infer<typeof HandoffPackageSchema>;

export const HandoffEntrySchema = z.union([
  HandoffPackageSchema,
  RawFallbackNodeSchema,
]);
export type HandoffEntry = z.infer<typeof HandoffEntrySchema>;

// ── Markers (.mode / .sticky) ──────────────────────────────────────────

export const MarkersSchema = z.object({
  mode: z.string().nullable(),
  sticky: z.boolean(),
  modePath: ArtefactPathSchema.optional(),
  stickyPath: ArtefactPathSchema.optional(),
  parseHealth: ParseHealthSchema.optional(),
});
export type Markers = z.infer<typeof MarkersSchema>;

// ── Commits queue ──────────────────────────────────────────────────────

export const CommitQueueItemSchema = z.object({
  id: z.string().optional(),
  message: z.string().optional(),
  path: ArtefactPathSchema.optional(),
  status: z.string().optional(),
  raw: z.unknown().optional(),
});
export type CommitQueueItem = z.infer<typeof CommitQueueItemSchema>;

export const CommitsQueueSchema = z.object({
  present: z.boolean(),
  path: ArtefactPathSchema.optional(),
  items: z.array(CommitQueueItemSchema),
  parseHealth: ParseHealthSchema.optional(),
  raw: z.string().optional(),
});
export type CommitsQueue = z.infer<typeof CommitsQueueSchema>;

// ── Events presence (not the line stream) ──────────────────────────────

export const EventsPresenceSchema = z.object({
  /** Whether `.hyperflow/events.ndjson` exists on disk. */
  present: z.boolean(),
  path: ArtefactPathSchema.optional(),
  byteLength: z.number().int().nonnegative().optional(),
  lineCountEstimate: z.number().int().nonnegative().optional(),
  /** Reduced-fidelity mode when events file is absent (§4.3). */
  reducedFidelity: z.boolean(),
});
export type EventsPresence = z.infer<typeof EventsPresenceSchema>;

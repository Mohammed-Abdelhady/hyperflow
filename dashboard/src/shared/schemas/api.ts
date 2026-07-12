import { z } from "zod";
import { SnapshotSchema } from "./snapshot.js";
import { EventLineResultSchema } from "./event-line.js";
import {
  ConfigReadResultSchema,
  ConfigWriteSchema,
} from "./config.js";
import { MarkersSchema } from "./snapshot-ops.js";
import { HandoffEntrySchema } from "./snapshot-ops.js";

// ── Auth header (spec §3B.14) ──────────────────────────────────────────

/** Header name for session token on every /api/v1 request (except SSE query). */
export const HYPERFLOW_TOKEN_HEADER = "X-Hyperflow-Token" as const;

// ── Error code registry (spec §3B.15) ──────────────────────────────────

export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  TOKEN_INVALID: "TOKEN_INVALID",
  ORIGIN_DENIED: "ORIGIN_DENIED",
  PATH_BLOCKED: "PATH_BLOCKED",
  NOT_FOUND: "NOT_FOUND",
  WRITE_CONFLICT: "WRITE_CONFLICT",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ErrorCodeSchema = z.enum([
  ERROR_CODES.VALIDATION_FAILED,
  ERROR_CODES.TOKEN_INVALID,
  ERROR_CODES.ORIGIN_DENIED,
  ERROR_CODES.PATH_BLOCKED,
  ERROR_CODES.NOT_FOUND,
  ERROR_CODES.WRITE_CONFLICT,
  ERROR_CODES.INTERNAL,
]);

/** Deterministic HTTP status map — 1:1 with codes. */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  TOKEN_INVALID: 401,
  ORIGIN_DENIED: 403,
  PATH_BLOCKED: 403,
  NOT_FOUND: 404,
  WRITE_CONFLICT: 409,
  INTERNAL: 500,
};

export function httpStatusForErrorCode(code: ErrorCode): number {
  return ERROR_HTTP_STATUS[code];
}

/** Wire error envelope `{code, message, details?}`. */
export const ErrorEnvelopeSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

// ── Success envelopes per resource ─────────────────────────────────────

/** GET /api/v1/snapshot */
export const SnapshotResponseSchema = z.object({
  snapshot: SnapshotSchema,
});
export type SnapshotResponse = z.infer<typeof SnapshotResponseSchema>;

/** GET /api/v1/memory — category list or single category payload. */
export const MemoryListResponseSchema = z.object({
  memory: SnapshotSchema.shape.memory,
});
export type MemoryListResponse = z.infer<typeof MemoryListResponseSchema>;

export const MemoryWriteRequestSchema = z.object({
  category: z.string().min(1),
  content: z.string(),
  /** Client-observed mtime for write-conflict detection. */
  expectedMtimeMs: z.number().optional(),
  writeId: z.string().optional(),
});
export type MemoryWriteRequest = z.infer<typeof MemoryWriteRequestSchema>;

export const MemoryWriteResponseSchema = z.object({
  accepted: z.literal(true),
  writeId: z.string().optional(),
  path: z.string().optional(),
});
export type MemoryWriteResponse = z.infer<typeof MemoryWriteResponseSchema>;

/** GET/PUT /api/v1/config */
export const ConfigGetResponseSchema = z.object({
  config: ConfigReadResultSchema,
});
export type ConfigGetResponse = z.infer<typeof ConfigGetResponseSchema>;

export const ConfigPutRequestSchema = z.object({
  config: ConfigWriteSchema,
  expectedMtimeMs: z.number().optional(),
  writeId: z.string().optional(),
});
export type ConfigPutRequest = z.infer<typeof ConfigPutRequestSchema>;

export const ConfigPutResponseSchema = z.object({
  accepted: z.literal(true),
  writeId: z.string().optional(),
});
export type ConfigPutResponse = z.infer<typeof ConfigPutResponseSchema>;

/** GET/POST /api/v1/markers */
export const MarkersResponseSchema = z.object({
  markers: MarkersSchema,
});
export type MarkersResponse = z.infer<typeof MarkersResponseSchema>;

export const MarkersToggleRequestSchema = z.object({
  mode: z.string().nullable().optional(),
  sticky: z.boolean().optional(),
  writeId: z.string().optional(),
});
export type MarkersToggleRequest = z.infer<typeof MarkersToggleRequestSchema>;

/** GET/POST /api/v1/handoff */
export const HandoffListResponseSchema = z.object({
  handoff: z.array(HandoffEntrySchema),
});
export type HandoffListResponse = z.infer<typeof HandoffListResponseSchema>;

export const HandoffTransitionRequestSchema = z.object({
  slug: z.string().min(1),
  /** Target STATUS word — server enforces planned→built→reviewed. */
  status: z.enum(["planned", "built", "reviewed"]),
  writeId: z.string().optional(),
});
export type HandoffTransitionRequest = z.infer<
  typeof HandoffTransitionRequestSchema
>;

export const HandoffTransitionResponseSchema = z.object({
  accepted: z.literal(true),
  slug: z.string(),
  status: z.string(),
  writeId: z.string().optional(),
});
export type HandoffTransitionResponse = z.infer<
  typeof HandoffTransitionResponseSchema
>;

/** GET /api/v1/events — range fetch for replay scrubber. */
export const EventsRangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().positive().max(10_000).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type EventsRangeQuery = z.infer<typeof EventsRangeQuerySchema>;

export const EventsRangeResponseSchema = z.object({
  events: z.array(EventLineResultSchema),
  nextOffset: z.number().int().nonnegative().optional(),
  truncated: z.boolean().optional(),
});
export type EventsRangeResponse = z.infer<typeof EventsRangeResponseSchema>;

/**
 * GET /api/v1/stream — SSE bootstrap is connection-level; response body is the
 * event stream. Optional query params documented for clients.
 */
export const StreamBootstrapQuerySchema = z.object({
  /** SSE query-param token exception (§3B.14). */
  token: z.string().optional(),
  lastEventId: z.string().optional(),
});
export type StreamBootstrapQuery = z.infer<typeof StreamBootstrapQuerySchema>;

/** GET /api/v1/instance — second-launch identity ping. */
export const InstanceResponseSchema = z.object({
  ok: z.literal(true),
  port: z.number().int().positive().optional(),
  projectRoot: z.string().optional(),
});
export type InstanceResponse = z.infer<typeof InstanceResponseSchema>;

/** Generic write acceptance (POST echoes). */
export const WriteAcceptedResponseSchema = z.object({
  accepted: z.literal(true),
  writeId: z.string().optional(),
});
export type WriteAcceptedResponse = z.infer<typeof WriteAcceptedResponseSchema>;

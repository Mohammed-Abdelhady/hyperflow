import { z } from "zod";

/**
 * events.ndjson line schema (ADR-governed, spec §3B.6).
 * Shape: {v, ts, chain, skill, type, batch?, task?, status?, agent?, tokens?, detail?}
 *
 * Version gate:
 * - v === 1 → strict-with-passthrough (unknown extra fields tolerated)
 * - unknown / missing v → opaque raw-event variant (never throw)
 */

export const EVENT_LINE_V1 = 1 as const;

/** v:1 line — required core fields + optional emit touchpoint fields. */
export const EventLineV1Schema = z
  .object({
    v: z.literal(EVENT_LINE_V1),
    ts: z.string(),
    chain: z.string(),
    skill: z.string(),
    type: z.string(),
    batch: z.string().optional(),
    task: z.string().optional(),
    status: z.string().optional(),
    agent: z.string().optional(),
    tokens: z.number().optional(),
    detail: z.unknown().optional(),
  })
  .passthrough();
export type EventLineV1 = z.infer<typeof EventLineV1Schema>;

/**
 * Opaque raw-event when v is unknown, JSON is invalid, or v1 validation fails.
 * Best-effort `ts` / `type` extraction for display ordering (§4.3).
 */
export const OpaqueRawEventSchema = z.object({
  variant: z.literal("opaque"),
  v: z.unknown().optional(),
  raw: z.unknown(),
  ts: z.string().optional(),
  type: z.string().optional(),
  unparseable: z.boolean().optional(),
  issue: z.unknown().optional(),
});
export type OpaqueRawEvent = z.infer<typeof OpaqueRawEventSchema>;

export const EventLineV1ResultSchema = z.object({
  variant: z.literal("v1"),
  event: EventLineV1Schema,
});
export type EventLineV1Result = z.infer<typeof EventLineV1ResultSchema>;

export const EventLineResultSchema = z.discriminatedUnion("variant", [
  EventLineV1ResultSchema,
  OpaqueRawEventSchema,
]);
export type EventLineResult = z.infer<typeof EventLineResultSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bestEffortString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function opaqueFromRecord(
  input: Record<string, unknown>,
  extras: {
    unparseable?: boolean;
    issue?: unknown;
  } = {},
): OpaqueRawEvent {
  const result: OpaqueRawEvent = {
    variant: "opaque",
    raw: input,
  };
  if ("v" in input) {
    result.v = input["v"];
  }
  const ts = bestEffortString(input, "ts");
  if (ts !== undefined) result.ts = ts;
  const type = bestEffortString(input, "type");
  if (type !== undefined) result.type = type;
  if (extras.unparseable !== undefined) result.unparseable = extras.unparseable;
  if (extras.issue !== undefined) result.issue = extras.issue;
  return result;
}

/**
 * Parse one events.ndjson candidate (already-complete line object or raw value).
 * Never throws — unknown v and schema failures become opaque variants.
 */
export function parseEventLine(input: unknown): EventLineResult {
  if (!isRecord(input)) {
    return {
      variant: "opaque",
      raw: input,
      unparseable: true,
    };
  }

  const v = input["v"];
  if (v === EVENT_LINE_V1) {
    const parsed = EventLineV1Schema.safeParse(input);
    if (parsed.success) {
      return { variant: "v1", event: parsed.data };
    }
    return opaqueFromRecord(input, { issue: parsed.error.flatten() });
  }

  return opaqueFromRecord(input);
}

/**
 * Parse a raw NDJSON text line. Empty/whitespace → null (skip).
 * JSON parse failure → opaque unparseable (never throw).
 */
export function parseEventLineText(line: string): EventLineResult | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  try {
    const json: unknown = JSON.parse(trimmed);
    return parseEventLine(json);
  } catch {
    return {
      variant: "opaque",
      raw: trimmed,
      unparseable: true,
    };
  }
}

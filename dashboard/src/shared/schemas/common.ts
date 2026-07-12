import { z } from "zod";

/** Per-file parse outcome feeding Flow Health (§4.2). */
export const ParseHealthStateSchema = z.enum([
  "ok",
  "degraded",
  "derived",
  "parseError",
]);
export type ParseHealthState = z.infer<typeof ParseHealthStateSchema>;

/** Machine-readable diagnostic attached to a parse-health record. */
export const ParseDiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.unknown().optional(),
});
export type ParseDiagnostic = z.infer<typeof ParseDiagnosticSchema>;

export const ParseHealthSchema = z.object({
  state: ParseHealthStateSchema,
  format: z.string().optional(),
  diagnostics: z.array(ParseDiagnosticSchema).default([]),
});
export type ParseHealth = z.infer<typeof ParseHealthSchema>;

/** Jail-relative artefact path identity. */
export const ArtefactPathSchema = z.string().min(1);
export type ArtefactPath = z.infer<typeof ArtefactPathSchema>;

/**
 * Raw-markdown fallback node produced on parse failure.
 * Carried inside snapshot + snapshot-delta (spec §3B.13, §4.2).
 */
export const RawFallbackNodeSchema = z.object({
  parseError: z.literal(true),
  path: ArtefactPathSchema,
  raw: z.string(),
  reason: z.string().optional(),
  mtimeMs: z.number().optional(),
});
export type RawFallbackNode = z.infer<typeof RawFallbackNodeSchema>;

export const ProgressCountsSchema = z.object({
  done: z.number().int().nonnegative(),
  running: z.number().int().nonnegative().default(0),
  pending: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type ProgressCounts = z.infer<typeof ProgressCountsSchema>;

/** Status-block field map — unknown fields preserved. */
export const StatusFieldMapSchema = z.record(z.string(), z.string());
export type StatusFieldMap = z.infer<typeof StatusFieldMapSchema>;

export const CheckboxStateSchema = z.enum(["pending", "done", "running"]);
export type CheckboxState = z.infer<typeof CheckboxStateSchema>;

export const TableRowSchema = z.record(z.string(), z.string());
export type TableRow = z.infer<typeof TableRowSchema>;

export const GenericTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(TableRowSchema),
});
export type GenericTable = z.infer<typeof GenericTableSchema>;

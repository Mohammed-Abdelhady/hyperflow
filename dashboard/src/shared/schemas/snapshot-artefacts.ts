import { z } from "zod";
import {
  ArtefactPathSchema,
  CheckboxStateSchema,
  GenericTableSchema,
  ParseHealthSchema,
  ProgressCountsSchema,
  RawFallbackNodeSchema,
  StatusFieldMapSchema,
} from "./common.js";

// ── Tasks ──────────────────────────────────────────────────────────────

export const SubTaskDetailSchema = z.object({
  read: z.array(z.string()).optional(),
  modify: z.array(z.string()).optional(),
  create: z.array(z.string()).optional(),
  complexity: z.string().optional(),
  specialist: z.string().optional(),
  brief: z.string().optional(),
});
export type SubTaskDetail = z.infer<typeof SubTaskDetailSchema>;

export const SubTaskSchema = z.object({
  taskId: z.string().optional(),
  role: z.string().optional(),
  title: z.string(),
  state: CheckboxStateSchema,
  detail: SubTaskDetailSchema.optional(),
  label: z.string().optional(),
});
export type SubTask = z.infer<typeof SubTaskSchema>;

export const TaskFormatSchema = z.enum(["frontmatter", "roster", "derived"]);
export type TaskFormat = z.infer<typeof TaskFormatSchema>;

export const TaskNodeSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  slug: z.string(),
  format: TaskFormatSchema,
  status: z.string().optional(),
  statusFields: StatusFieldMapSchema.optional(),
  progress: ProgressCountsSchema,
  subTasks: z.array(SubTaskSchema),
  objective: z.string().optional(),
  estimatedCost: GenericTableSchema.optional(),
  actualCost: GenericTableSchema.optional(),
  executionPlanRaw: z.string().optional(),
  raw: z.string().optional(),
  parseHealth: ParseHealthSchema,
  mtimeMs: z.number().optional(),
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

export const TaskEntrySchema = z.union([TaskNodeSchema, RawFallbackNodeSchema]);
export type TaskEntry = z.infer<typeof TaskEntrySchema>;

// ── Features ───────────────────────────────────────────────────────────

export const FeaturePhaseSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  folder: z.string(),
  index: z.number().int().nonnegative(),
  name: z.string(),
  status: z.string().optional(),
  statusFields: StatusFieldMapSchema.optional(),
  progress: ProgressCountsSchema.optional(),
  dependsOn: z.array(z.string()).default([]),
  tasks: z.array(TaskEntrySchema),
  exitCriteria: z
    .array(z.object({ label: z.string(), state: CheckboxStateSchema }))
    .default([]),
  parseHealth: ParseHealthSchema,
  raw: z.string().optional(),
});
export type FeaturePhase = z.infer<typeof FeaturePhaseSchema>;

export const FeaturePhaseEntrySchema = z.union([
  FeaturePhaseSchema,
  RawFallbackNodeSchema,
]);
export type FeaturePhaseEntry = z.infer<typeof FeaturePhaseEntrySchema>;

export const FeatureNodeSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  slug: z.string(),
  name: z.string(),
  status: z.string().optional(),
  statusFields: StatusFieldMapSchema.optional(),
  goal: z.string().optional(),
  phases: z.array(FeaturePhaseEntrySchema),
  dependencyGraphRaw: z.string().optional(),
  parseHealth: ParseHealthSchema,
  mtimeMs: z.number().optional(),
  raw: z.string().optional(),
});
export type FeatureNode = z.infer<typeof FeatureNodeSchema>;

export const FeatureEntrySchema = z.union([
  FeatureNodeSchema,
  RawFallbackNodeSchema,
]);
export type FeatureEntry = z.infer<typeof FeatureEntrySchema>;

// ── Specs ──────────────────────────────────────────────────────────────

export const SpecSectionSchema = z.object({
  level: z.number().int().min(1).max(6),
  text: z.string(),
  anchor: z.string(),
  sectionNumber: z.number().int().optional(),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
  mermaidBlocks: z.array(z.string()).default([]),
});
export type SpecSection = z.infer<typeof SpecSectionSchema>;

export const SpecNodeSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  slug: z.string(),
  draft: z.boolean().default(false),
  status: z.string().optional(),
  statusFields: StatusFieldMapSchema.optional(),
  progressText: z.string().optional(),
  progressDone: z.number().int().optional(),
  progressTotal: z.number().int().optional(),
  tldr: z.string().optional(),
  components: z.array(z.string()).default([]),
  sections: z.array(SpecSectionSchema),
  hasTradeoffs: z.boolean().default(false),
  parseHealth: ParseHealthSchema,
  mtimeMs: z.number().optional(),
  raw: z.string().optional(),
});
export type SpecNode = z.infer<typeof SpecNodeSchema>;

export const SpecEntrySchema = z.union([SpecNodeSchema, RawFallbackNodeSchema]);
export type SpecEntry = z.infer<typeof SpecEntrySchema>;

// ── Audits ─────────────────────────────────────────────────────────────

export const AuditSeveritySchema = z.enum([
  "Critical",
  "Important",
  "Suggestion",
  "Praise",
]);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

export const AuditFindingSchema = z.object({
  severity: AuditSeveritySchema.or(z.literal("unknown")),
  file: z.string().optional(),
  line: z.number().int().optional(),
  title: z.string(),
  issue: z.string().optional(),
  fix: z.string().optional(),
  why: z.string().optional(),
  raw: z.boolean().optional(),
});
export type AuditFinding = z.infer<typeof AuditFindingSchema>;

export const AuditSeverityRollupSchema = z.object({
  Critical: z.number().int().nonnegative(),
  Important: z.number().int().nonnegative(),
  Suggestion: z.number().int().nonnegative(),
  Praise: z.number().int().nonnegative(),
});
export type AuditSeverityRollup = z.infer<typeof AuditSeverityRollupSchema>;

export const AuditNodeSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  slug: z.string(),
  verdict: z.string().optional(),
  statusFields: StatusFieldMapSchema.optional(),
  findingsSummary: AuditSeverityRollupSchema.optional(),
  findings: z.array(AuditFindingSchema),
  rollup: AuditSeverityRollupSchema,
  source: z.string().optional(),
  parseHealth: ParseHealthSchema,
  mtimeMs: z.number().optional(),
  raw: z.string().optional(),
});
export type AuditNode = z.infer<typeof AuditNodeSchema>;

export const AuditEntrySchema = z.union([
  AuditNodeSchema,
  RawFallbackNodeSchema,
]);
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// ── Memory ─────────────────────────────────────────────────────────────

export const MemoryEntryClassSchema = z.enum([
  "tagged",
  "archived",
  "legacy",
  "raw",
]);
export type MemoryEntryClass = z.infer<typeof MemoryEntryClassSchema>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  class: MemoryEntryClassSchema,
  title: z.string(),
  date: z.string().optional(),
  tags: z.array(z.string()).default([]),
  what: z.string().optional(),
  why: z.string().optional(),
  evidence: z.string().optional(),
  sourceSlug: z.string().optional(),
  archived: z.boolean().optional(),
  summary: z.string().optional(),
  archivePointer: z.string().optional(),
  category: z.string().optional(),
  frequency: z.number().optional(),
  lastSeen: z.string().optional(),
  recommendation: z.string().optional(),
  rawBody: z.string().optional(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemoryCategoryFileSchema = z.object({
  parseError: z.literal(false).optional(),
  path: ArtefactPathSchema,
  category: z.string(),
  entries: z.array(MemoryEntrySchema),
  parseHealth: ParseHealthSchema,
  mtimeMs: z.number().optional(),
  raw: z.string().optional(),
});
export type MemoryCategoryFile = z.infer<typeof MemoryCategoryFileSchema>;

export const MemoryCategoryEntrySchema = z.union([
  MemoryCategoryFileSchema,
  RawFallbackNodeSchema,
]);
export type MemoryCategoryEntry = z.infer<typeof MemoryCategoryEntrySchema>;

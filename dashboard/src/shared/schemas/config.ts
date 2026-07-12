import { z } from "zod";

/**
 * Zod mirror of repo-root `config/schema.json`.
 * Do NOT load schema.json at runtime — drift is guarded by unit test.
 *
 * Write-mode: strict root (reject unknown root keys, additionalProperties: false).
 * Read-mode: tolerant — unknown root keys preserved and listed as unrecognized.
 */

/** Root keys defined by config/schema.json today. */
export const CONFIG_ROOT_KEYS = [
  "security",
  "memory",
  "context",
  "handoff",
  "specialists",
] as const;

export type ConfigRootKey = (typeof CONFIG_ROOT_KEYS)[number];

export const CONFIG_ROOT_KEY_SET: ReadonlySet<string> = new Set(CONFIG_ROOT_KEYS);

const StringListSchema = z.array(z.string());

const AddRemoveListSchema = z
  .object({
    add: StringListSchema.optional(),
    remove: StringListSchema.optional(),
  })
  .strict();

export const SecurityConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    blockedFiles: AddRemoveListSchema.optional(),
    blockedCommands: AddRemoveListSchema.optional(),
    secretPatterns: AddRemoveListSchema.optional(),
    allowedFiles: StringListSchema.optional(),
  })
  .strict();
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export const MemoryConfigSchema = z
  .object({
    compactionThreshold: z.number().int().min(50).optional(),
  })
  .strict();
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

export const ContextConfigSchema = z
  .object({
    windowTokens: z.number().int().min(10_000).optional(),
    autoCompactMinPercent: z.number().int().min(1).max(99).optional(),
    autoCompactReadyTtlMinutes: z.number().int().min(1).max(1440).optional(),
  })
  .strict();
export type ContextConfig = z.infer<typeof ContextConfigSchema>;

export const HandoffConfigSchema = z
  .object({
    autoPush: z.boolean().optional(),
    remote: z.string().optional(),
    packageDir: z.string().optional(),
  })
  .strict();
export type HandoffConfig = z.infer<typeof HandoffConfigSchema>;

export const BrainSpecialistConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict();
export type BrainSpecialistConfig = z.infer<typeof BrainSpecialistConfigSchema>;

export const WebResearchConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    maxSources: z.number().int().min(1).max(20).optional(),
    recencyMonths: z.number().int().min(1).optional(),
    offlineSkip: z.boolean().optional(),
    flowGate: z.array(z.string()).optional(),
  })
  .strict();
export type WebResearchConfig = z.infer<typeof WebResearchConfigSchema>;

export const SpecialistsConfigSchema = z
  .object({
    brain: BrainSpecialistConfigSchema.optional(),
    webResearch: WebResearchConfigSchema.optional(),
  })
  .strict();
export type SpecialistsConfig = z.infer<typeof SpecialistsConfigSchema>;

/**
 * Known config shape — write path uses `.strict()` so unknown root keys fail.
 * Mirrors `additionalProperties: false` at the schema.json root.
 */
export const ConfigWriteSchema = z
  .object({
    security: SecurityConfigSchema.optional(),
    memory: MemoryConfigSchema.optional(),
    context: ContextConfigSchema.optional(),
    handoff: HandoffConfigSchema.optional(),
    specialists: SpecialistsConfigSchema.optional(),
  })
  .strict();
export type ConfigWrite = z.infer<typeof ConfigWriteSchema>;

/**
 * Read-mode result: known keys validated, unknown root keys preserved
 * under `unrecognized` and listed in `unrecognizedKeys` (spec §3B.9).
 */
export const ConfigReadResultSchema = z.object({
  config: ConfigWriteSchema,
  unrecognized: z.record(z.string(), z.unknown()),
  unrecognizedKeys: z.array(z.string()),
});
export type ConfigReadResult = z.infer<typeof ConfigReadResultSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Write-mode parse — rejects unknown root keys and nested additionalProperties.
 */
export function parseConfigWrite(
  input: unknown,
): z.SafeParseReturnType<unknown, ConfigWrite> {
  return ConfigWriteSchema.safeParse(input);
}

/**
 * Read-mode parse — preserves unknown root keys as unrecognized.
 * Known keys are still validated for shape; failure returns error (caller
 * may degrade per-key at the parser layer).
 */
export function parseConfigRead(
  input: unknown,
):
  | { success: true; data: ConfigReadResult }
  | { success: false; error: z.ZodError } {
  if (!isRecord(input)) {
    const result = ConfigWriteSchema.safeParse(input);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      data: {
        config: result.data,
        unrecognized: {},
        unrecognizedKeys: [],
      },
    };
  }

  const known: Record<string, unknown> = {};
  const unrecognized: Record<string, unknown> = {};
  const unrecognizedKeys: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (CONFIG_ROOT_KEY_SET.has(key)) {
      known[key] = value;
    } else {
      unrecognized[key] = value;
      unrecognizedKeys.push(key);
    }
  }

  const parsed = ConfigWriteSchema.safeParse(known);
  if (!parsed.success) {
    return { success: false, error: parsed.error };
  }

  return {
    success: true,
    data: {
      config: parsed.data,
      unrecognized,
      unrecognizedKeys,
    },
  };
}

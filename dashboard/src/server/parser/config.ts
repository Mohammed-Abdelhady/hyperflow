/**
 * Read-side config.json parser with drift tolerance.
 * Known keys validated; unknown keys preserved + enumerated.
 * Never throws.
 */

import type { RawFallbackNode } from "@shared/schemas/common.js";
import {
  CONFIG_ROOT_KEY_SET,
  parseConfigRead,
  type ConfigReadResult,
  type ConfigWrite,
} from "@shared/schemas/config.js";
import {
  createRawFallback,
  diagnostic,
  normalizeInput,
  parseHealthDegraded,
  parseHealthOk,
  withParseFallback,
} from "./primitives/index.js";
import type { ParseHealth } from "@shared/schemas/common.js";

export type ConfigParseNode = {
  parseError?: false;
  path: string;
  present: boolean;
  result?: ConfigReadResult;
  /** Per-key degradation when a known key fails shape validation. */
  degradedKeys?: Record<string, { value: unknown; issue: unknown }>;
  parseHealth: ParseHealth;
  raw?: string;
};

export type ConfigParseEntry = ConfigParseNode | RawFallbackNode;

export type ParseConfigOptions = {
  path?: string;
  raw: string | null | undefined;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize defaults.json-style security lists (plain string[]) into the
 * schema's { add, remove } override shape so read-mode validation accepts both.
 */
function normalizeConfigInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const out: Record<string, unknown> = { ...input };
  if (!isRecord(out["security"])) return out;
  const sec: Record<string, unknown> = { ...out["security"] };
  for (const key of ["blockedFiles", "blockedCommands", "secretPatterns"] as const) {
    const val = sec[key];
    if (Array.isArray(val) && val.every((x) => typeof x === "string")) {
      sec[key] = { add: val as string[] };
    }
  }
  out["security"] = sec;
  return out;
}

function parseConfigInner(opts: ParseConfigOptions): ConfigParseEntry {
  const path = opts.path ?? "config.json";

  if (opts.raw === null || opts.raw === undefined || opts.raw.trim() === "") {
    const empty: ConfigParseNode = {
      path,
      present: false,
      result: {
        config: {},
        unrecognized: {},
        unrecognizedKeys: [],
      },
      parseHealth: parseHealthOk("config-empty"),
    };
    return empty;
  }

  const text = normalizeInput(opts.raw);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return createRawFallback({
      path,
      raw: text,
      reason: "invalid-json",
      alreadyNormalized: true,
    });
  }

  json = normalizeConfigInput(json);

  // First attempt: full read-mode parse
  const parsed = parseConfigRead(json);
  if (parsed.success) {
    const node: ConfigParseNode = {
      path,
      present: true,
      result: parsed.data,
      parseHealth: parseHealthOk(
        "config",
        parsed.data.unrecognizedKeys.length > 0
          ? [
              diagnostic(
                "unrecognized-keys",
                `Unrecognized root keys: ${parsed.data.unrecognizedKeys.join(", ")}`,
                parsed.data.unrecognizedKeys,
              ),
            ]
          : [],
      ),
      raw: text,
    };
    return node;
  }

  // Per-key degradation: validate each known key independently
  if (!isRecord(json)) {
    return createRawFallback({
      path,
      raw: text,
      reason: "root-not-object",
      alreadyNormalized: true,
    });
  }

  const known: Record<string, unknown> = {};
  const unrecognized: Record<string, unknown> = {};
  const unrecognizedKeys: string[] = [];
  const degradedKeys: Record<string, { value: unknown; issue: unknown }> = {};

  for (const [key, value] of Object.entries(json)) {
    if (!CONFIG_ROOT_KEY_SET.has(key)) {
      unrecognized[key] = value;
      unrecognizedKeys.push(key);
      continue;
    }
    // Try parse single-key config
    const one = parseConfigRead({ [key]: value });
    if (one.success && one.data.config[key as keyof ConfigWrite] !== undefined) {
      known[key] = value;
    } else {
      degradedKeys[key] = {
        value,
        issue: one.success ? "shape" : one.error.flatten(),
      };
    }
  }

  // Re-parse known-good keys only
  const good = parseConfigRead(known);
  const config: ConfigWrite = good.success ? good.data.config : {};

  const node: ConfigParseNode = {
    path,
    present: true,
    result: { config, unrecognized, unrecognizedKeys },
    degradedKeys,
    parseHealth: parseHealthDegraded("config", [
      diagnostic(
        "per-key-degrade",
        `Degraded keys: ${Object.keys(degradedKeys).join(", ") || "none"}`,
        Object.keys(degradedKeys),
      ),
    ]),
    raw: text,
  };
  return node;
}

/** Parse config.json content (read-side, drift-tolerant). Never throws. */
export function parseConfig(opts: ParseConfigOptions): ConfigParseEntry {
  return withParseFallback(
    opts.path ?? "config.json",
    opts.raw ?? "",
    () => parseConfigInner(opts),
  );
}

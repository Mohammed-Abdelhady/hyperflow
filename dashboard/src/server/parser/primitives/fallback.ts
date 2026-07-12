/**
 * Raw-markdown fallback constructor + never-throw parse wrapper.
 * Every surface parser routes through these helpers.
 */

import type {
  ParseDiagnostic,
  ParseHealth,
  RawFallbackNode,
} from "@shared/schemas/common.js";
import { normalizeInput } from "./normalize.js";

export type FallbackInput = {
  path: string;
  raw: string;
  reason?: string | undefined;
  mtimeMs?: number | undefined;
  /** When true, skip normalize (raw already normalized). */
  alreadyNormalized?: boolean | undefined;
};

/** Construct the shared-schema RawFallback node. */
export function createRawFallback(input: FallbackInput): RawFallbackNode {
  const raw = input.alreadyNormalized
    ? input.raw
    : normalizeInput(input.raw);
  const node: RawFallbackNode = {
    parseError: true,
    path: input.path,
    raw,
  };
  if (input.reason !== undefined) node.reason = input.reason;
  if (input.mtimeMs !== undefined) node.mtimeMs = input.mtimeMs;
  return node;
}

export function parseHealthOk(
  format?: string,
  diagnostics: ParseDiagnostic[] = [],
): ParseHealth {
  const health: ParseHealth = {
    state: "ok",
    diagnostics,
  };
  if (format !== undefined) health.format = format;
  return health;
}

export function parseHealthDerived(
  format?: string,
  diagnostics: ParseDiagnostic[] = [],
): ParseHealth {
  const health: ParseHealth = {
    state: "derived",
    diagnostics,
  };
  if (format !== undefined) health.format = format;
  return health;
}

export function parseHealthDegraded(
  format?: string,
  diagnostics: ParseDiagnostic[] = [],
): ParseHealth {
  const health: ParseHealth = {
    state: "degraded",
    diagnostics,
  };
  if (format !== undefined) health.format = format;
  return health;
}

export function parseHealthError(
  reason: string,
  format?: string,
): ParseHealth {
  const health: ParseHealth = {
    state: "parseError",
    diagnostics: [{ code: "parseError", message: reason }],
  };
  if (format !== undefined) health.format = format;
  return health;
}

export function diagnostic(
  code: string,
  message: string,
  detail?: unknown,
): ParseDiagnostic {
  const d: ParseDiagnostic = { code, message };
  if (detail !== undefined) d.detail = detail;
  return d;
}

/**
 * Run a parse function; any throw becomes a RawFallback.
 * Surface parsers use this so never-throw is structural.
 */
export function withParseFallback<T>(
  path: string,
  raw: string,
  parse: () => T,
  mtimeMs?: number,
): T | RawFallbackNode {
  try {
    return parse();
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "unexpected-parse-error";
    const input: FallbackInput = { path, raw, reason };
    if (mtimeMs !== undefined) input.mtimeMs = mtimeMs;
    return createRawFallback(input);
  }
}

/**
 * Discriminate fallback nodes without importing shared derived helpers.
 */
export function isRawFallback(value: unknown): value is RawFallbackNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "parseError" in value &&
    (value as { parseError?: unknown }).parseError === true
  );
}

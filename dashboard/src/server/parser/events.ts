/**
 * events.ndjson line parser — pure string → EventLineResult | skip.
 * Version gate + opaque fallback. No file IO. Never throws.
 *
 * Re-exports shared schema helpers and adds batch/tally utilities.
 */

import {
  parseEventLine,
  parseEventLineText,
  type EventLineResult,
} from "@shared/schemas/event-line.js";
import { normalizeInput } from "./primitives/normalize.js";

export { parseEventLine, parseEventLineText };
export type { EventLineResult };

export type EventsBatchDiagnostics = {
  total: number;
  parsed: number;
  opaque: number;
  unparseable: number;
  skipped: number;
};

export type EventsBatchResult = {
  events: EventLineResult[];
  diagnostics: EventsBatchDiagnostics;
};

/**
 * Parse one candidate NDJSON line (may be torn/truncated).
 * Empty/whitespace → null (caller skips).
 */
export function parseEventsLine(line: string): EventLineResult | null {
  try {
    return parseEventLineText(line);
  } catch {
    return {
      variant: "opaque",
      raw: line,
      unparseable: true,
    };
  }
}

/**
 * Map an array of candidate lines through the line parser.
 * Counts diagnostics for the tailer / range-fetch services.
 */
export function parseEventsBatch(lines: string[]): EventsBatchResult {
  const events: EventLineResult[] = [];
  const diagnostics: EventsBatchDiagnostics = {
    total: lines.length,
    parsed: 0,
    opaque: 0,
    unparseable: 0,
    skipped: 0,
  };

  for (const line of lines) {
    const result = parseEventsLine(line);
    if (result === null) {
      diagnostics.skipped += 1;
      continue;
    }
    events.push(result);
    if (result.variant === "v1") {
      diagnostics.parsed += 1;
    } else {
      diagnostics.opaque += 1;
      if (result.unparseable) diagnostics.unparseable += 1;
    }
  }

  return { events, diagnostics };
}

/**
 * Split NDJSON file text into lines and parse as a batch.
 * BOM/CRLF normalized at the boundary.
 */
export function parseEventsText(raw: string): EventsBatchResult {
  try {
    const text = normalizeInput(raw);
    if (text.length === 0) {
      return {
        events: [],
        diagnostics: {
          total: 0,
          parsed: 0,
          opaque: 0,
          unparseable: 0,
          skipped: 0,
        },
      };
    }
    const lines = text.split("\n");
    return parseEventsBatch(lines);
  } catch {
    return {
      events: [
        {
          variant: "opaque",
          raw,
          unparseable: true,
        },
      ],
      diagnostics: {
        total: 1,
        parsed: 0,
        opaque: 1,
        unparseable: 1,
        skipped: 0,
      },
    };
  }
}

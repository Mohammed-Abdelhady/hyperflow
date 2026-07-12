/**
 * Dual-format status-block parser: markdown `| Field | Value |` tables
 * and plain `Key:` lines (status/SKILL.md grep contract).
 * Never throws — absent or degraded results only.
 */

import type { StatusFieldMap } from "@shared/schemas/common.js";
import { normalizeInput, splitLines } from "./normalize.js";
import type {
  StatusBlockAbsent,
  StatusBlockPresent,
  StatusBlockResult,
} from "./status-block-types.js";
import {
  parseStatusTable,
  progressFromFields,
} from "./status-table.js";

export type {
  StatusBlockAbsent,
  StatusBlockPresent,
  StatusBlockProgress,
  StatusBlockResult,
  StatusBlockStyle,
} from "./status-block-types.js";

/** Known key-line prefixes from the status grep contract. */
const KEYLINE_PREFIXES = [
  "Sub-tasks:",
  "Tokens used:",
  "Wall-clock:",
  "ETA:",
  "Started:",
  "Last update:",
  "Status:",
  "Progress:",
  "Branch:",
  "Commits:",
  "Tokens:",
  "Specialists:",
  "Verdict:",
  "Scope:",
  "Level:",
  "Findings:",
  "Date:",
  "Phases:",
  "Depends on:",
] as const;

function keyLineFieldName(prefix: string): string {
  return prefix.endsWith(":") ? prefix.slice(0, -1) : prefix;
}

function parseKeyLines(lines: string[]): StatusBlockPresent | StatusBlockAbsent {
  const fields: StatusFieldMap = {};
  let found = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    for (const prefix of KEYLINE_PREFIXES) {
      const re = new RegExp(`^${prefix.replace(":", "\\s*:")}\\s*`, "i");
      if (!re.test(trimmed)) continue;
      const value = trimmed.replace(re, "").trim();
      fields[keyLineFieldName(prefix)] = value;
      found = true;
      break;
    }
  }

  if (!found) return { present: false, reason: "no-keylines" };

  const progress = progressFromFields(fields);
  const result: StatusBlockPresent = {
    present: true,
    style: "keyline",
    fields,
  };
  if (progress) result.progress = progress;
  return result;
}

function findStatusHeadingIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (/^##\s+Status\s*$/i.test(t)) return i;
  }
  return -1;
}

/**
 * Parse a status block from a markdown document (or section).
 * Priority: table under `## Status` → any leading table → key-lines.
 */
export function parseStatusBlock(raw: string): StatusBlockResult {
  try {
    const text = normalizeInput(raw);
    if (text.trim().length === 0) {
      return { present: false, reason: "empty" };
    }
    const lines = splitLines(text);

    const statusIdx = findStatusHeadingIndex(lines);
    if (statusIdx >= 0) {
      let scan = statusIdx + 1;
      while (scan < lines.length && (lines[scan] ?? "").trim() === "") {
        scan += 1;
      }
      const first = (lines[scan] ?? "").trim();
      if (first.startsWith("|")) {
        const table = parseStatusTable(lines, scan);
        if (table.present) return table;
      }
      const sectionLines: string[] = [];
      for (let i = statusIdx + 1; i < lines.length; i += 1) {
        const t = (lines[i] ?? "").trim();
        if (/^#{1,6}\s/.test(t)) break;
        sectionLines.push(lines[i] ?? "");
      }
      const keyline = parseKeyLines(sectionLines);
      if (keyline.present) return keyline;
      return { present: false, reason: "status-heading-empty" };
    }

    for (let i = 0; i < lines.length; i += 1) {
      const t = (lines[i] ?? "").trim();
      if (t.length === 0) continue;
      if (t.startsWith("|")) {
        const table = parseStatusTable(lines, i);
        if (table.present) return table;
        break;
      }
      if (/^#{1,6}\s/.test(t)) break;
    }

    const keyline = parseKeyLines(lines);
    if (keyline.present) return keyline;

    return { present: false, reason: "missing-block" };
  } catch (err) {
    return {
      present: false,
      reason: err instanceof Error ? err.message : "status-block-error",
    };
  }
}

/** Parse any two-column markdown table into a field map (no ## Status required). */
export function parseFieldTable(raw: string): StatusFieldMap | undefined {
  try {
    const lines = splitLines(raw);
    for (let i = 0; i < lines.length; i += 1) {
      const t = (lines[i] ?? "").trim();
      if (!t.startsWith("|")) continue;
      const result = parseStatusTable(lines, i);
      if (result.present && Object.keys(result.fields).length > 0) {
        return result.fields;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

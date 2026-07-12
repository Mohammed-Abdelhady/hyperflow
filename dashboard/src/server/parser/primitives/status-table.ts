/**
 * Two-column markdown status table row walker.
 */

import type { StatusFieldMap } from "@shared/schemas/common.js";
import { extractNmProgress } from "./normalize.js";
import type {
  StatusBlockAbsent,
  StatusBlockPresent,
  StatusBlockProgress,
} from "./status-block-types.js";

const TABLE_ROW_RE = /^\|(.+)\|$/;
const SEPARATOR_RE = /^\|?\s*:?-{3,}/;

function trimCell(cell: string): string {
  return cell.trim();
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every(
    (c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")) || c === "",
  );
}

export function parseTableRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!TABLE_ROW_RE.test(trimmed)) return undefined;
  const inner = trimmed.slice(1, trimmed.endsWith("|") ? -1 : undefined);
  return inner.split("|").map(trimCell);
}

function looksTornTableRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return !t.endsWith("|");
}

export function progressFromFields(
  fields: StatusFieldMap,
): StatusBlockProgress | undefined {
  const candidates = [
    fields["Progress"],
    fields["Sub-tasks"],
    fields["Phases"],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const nm = extractNmProgress(raw);
    if (nm) return { done: nm.done, total: nm.total };
  }
  return undefined;
}

export function parseStatusTable(
  lines: string[],
  startIdx: number,
): StatusBlockPresent | StatusBlockAbsent {
  const fields: StatusFieldMap = {};
  let i = startIdx;
  let sawHeader = false;
  let sawData = false;
  let torn = false;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (sawData) break;
      i += 1;
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed) && sawData) break;
    if (/^#{1,6}\s/.test(trimmed) && !sawData && !sawHeader) break;

    if (looksTornTableRow(trimmed)) {
      torn = true;
      break;
    }

    const cells = parseTableRow(trimmed);
    if (!cells) {
      if (sawData || sawHeader) break;
      return { present: false, reason: "no-table-rows" };
    }

    if (!sawHeader) {
      sawHeader = true;
      i += 1;
      const next = lines[i]?.trim() ?? "";
      const nextCells = parseTableRow(next);
      if (nextCells && isSeparatorRow(nextCells)) {
        i += 1;
      } else if (SEPARATOR_RE.test(next)) {
        i += 1;
      }
      continue;
    }

    if (isSeparatorRow(cells)) {
      i += 1;
      continue;
    }

    if (cells.length < 2) {
      torn = true;
      break;
    }

    const field = cells[0] ?? "";
    const value = cells.slice(1).join("|").trim();
    if (field.length > 0) {
      fields[field] = value;
      sawData = true;
    }
    i += 1;
  }

  if (!sawData) {
    if (torn) {
      return {
        present: true,
        style: "table",
        fields,
        degraded: true,
        reason: "malformed-table",
      };
    }
    return { present: false, reason: "empty-table" };
  }

  const progress = progressFromFields(fields);
  const result: StatusBlockPresent = {
    present: true,
    style: "table",
    fields,
  };
  if (progress) result.progress = progress;
  if (torn) {
    result.degraded = true;
    result.reason = "malformed-table";
  }
  return result;
}

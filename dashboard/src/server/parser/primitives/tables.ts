/**
 * Generic markdown table parser for cost tables and similar structures.
 * Never throws.
 */

import type { GenericTable, TableRow } from "@shared/schemas/common.js";
import { splitLines } from "./normalize.js";

function parseRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return undefined;
  const inner = trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed.slice(1);
  return inner.split("|").map((c) => c.trim());
}

function isSeparator(cells: string[]): boolean {
  return cells.every(
    (c) => c.length === 0 || /^:?-{3,}:?$/.test(c.replace(/\s/g, "")),
  );
}

/**
 * Parse the first markdown table found in `raw` into headers + row objects.
 */
export function parseGenericTable(raw: string): GenericTable | undefined {
  try {
    const lines = splitLines(raw);
    let headers: string[] | undefined;
    const rows: TableRow[] = [];

    for (let i = 0; i < lines.length; i += 1) {
      const cells = parseRow(lines[i] ?? "");
      if (!cells) {
        if (headers) break;
        continue;
      }
      if (!headers) {
        headers = cells;
        const next = parseRow(lines[i + 1] ?? "");
        if (next && isSeparator(next)) {
          i += 1;
        }
        continue;
      }
      if (isSeparator(cells)) continue;
      const row: TableRow = {};
      for (let c = 0; c < headers.length; c += 1) {
        const key = headers[c] ?? `col${c}`;
        row[key] = cells[c] ?? "";
      }
      rows.push(row);
    }

    if (!headers || headers.length === 0) return undefined;
    return { headers, rows };
  } catch {
    return undefined;
  }
}

/**
 * Find an H2 section by title (case-insensitive substring or exact) and
 * return its body text (until next H2).
 */
export function extractH2Section(
  raw: string,
  headingMatch: string | RegExp,
): string | undefined {
  try {
    const lines = splitLines(raw);
    let start = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const t = (lines[i] ?? "").trim();
      const m = t.match(/^##\s+(.+)$/);
      if (!m?.[1]) continue;
      const title = m[1].trim();
      const ok =
        typeof headingMatch === "string"
          ? title.toLowerCase() === headingMatch.toLowerCase() ||
            title.toLowerCase().includes(headingMatch.toLowerCase())
          : headingMatch.test(title);
      if (ok) {
        start = i + 1;
        break;
      }
    }
    if (start < 0) return undefined;
    const body: string[] = [];
    for (let i = start; i < lines.length; i += 1) {
      const t = (lines[i] ?? "").trim();
      if (/^##\s+/.test(t)) break;
      body.push(lines[i] ?? "");
    }
    return body.join("\n").trim();
  } catch {
    return undefined;
  }
}

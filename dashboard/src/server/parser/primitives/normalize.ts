/**
 * Read-boundary normalization shared by every markdown/JSON parser.
 * Strip UTF-8 BOM and normalize CRLF/CR → LF. Pure — never persisted.
 */

const BOM = "\uFEFF";

/** Strip leading BOM and normalize line endings to LF. */
export function normalizeInput(text: string): string {
  let s = text;
  if (s.startsWith(BOM)) {
    s = s.slice(BOM.length);
  }
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Split normalized text into lines (no trailing empty line forced). */
export function splitLines(text: string): string[] {
  const normalized = normalizeInput(text);
  if (normalized.length === 0) return [];
  return normalized.split("\n");
}

/**
 * Extract `N / M` progress pair from free text.
 * Matches forms like `7 / 15`, `Section 3 / 5 approved`, `partial (3/5)`.
 */
export function extractNmProgress(
  text: string,
): { done: number; total: number } | undefined {
  const m = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m?.[1] || !m[2]) return undefined;
  const done = Number.parseInt(m[1], 10);
  const total = Number.parseInt(m[2], 10);
  if (!Number.isFinite(done) || !Number.isFinite(total)) return undefined;
  return { done, total };
}

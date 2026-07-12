/**
 * Flat YAML frontmatter extractor for task-tracking.md shape.
 * String scalars only — no nested YAML dependency.
 * Never throws.
 */

import { normalizeInput, splitLines } from "./normalize.js";

export type FrontmatterMap = Record<string, string>;

export type FrontmatterPresent = {
  present: true;
  fields: FrontmatterMap;
  /** 0-based line index of the first body line after the closing fence. */
  bodyLineOffset: number;
  /** Character offset into the normalized document for the body start. */
  bodyCharOffset: number;
};

export type FrontmatterAbsent = {
  present: false;
  reason?: string;
};

export type FrontmatterResult = FrontmatterPresent | FrontmatterAbsent;

const FENCE = "---";

function parseScalarLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  // Skip YAML comments
  if (trimmed.startsWith("#")) return undefined;
  // Nested structure (indent or list) → not supported as scalar
  if (/^\s/.test(line) || trimmed.startsWith("-")) {
    return undefined;
  }
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return undefined;
  const key = trimmed.slice(0, colon).trim();
  let value = trimmed.slice(colon + 1).trim();
  // Strip matching quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (key.length === 0) return undefined;
  return { key, value };
}

/**
 * Detect document-leading `---` fence, extract flat key/value map, return body offsets.
 */
export function parseFrontmatter(raw: string): FrontmatterResult {
  try {
    const text = normalizeInput(raw);
    const lines = splitLines(text);
    if (lines.length === 0) {
      return { present: false, reason: "empty" };
    }

    const first = (lines[0] ?? "").trim();
    if (first !== FENCE) {
      return { present: false, reason: "no-fence" };
    }

    const fields: FrontmatterMap = {};
    let closeIdx = -1;

    for (let i = 1; i < lines.length; i += 1) {
      const trimmed = (lines[i] ?? "").trim();
      if (trimmed === FENCE) {
        closeIdx = i;
        break;
      }
      const parsed = parseScalarLine(lines[i] ?? "");
      if (parsed) {
        fields[parsed.key] = parsed.value;
      }
    }

    if (closeIdx < 0) {
      return { present: false, reason: "unterminated-fence" };
    }

    // Body starts on the line after the closing fence
    const bodyLineOffset = closeIdx + 1;
    // Char offset: rejoin lines up to body
    let bodyCharOffset = 0;
    for (let i = 0; i < bodyLineOffset; i += 1) {
      bodyCharOffset += (lines[i] ?? "").length;
      if (i < lines.length - 1) bodyCharOffset += 1; // newline
    }
    // If body starts mid-document and previous line had newline
    // After close fence line, the next char is after that line's \n
    // bodyCharOffset already counts through closeIdx line + its trailing \n
    // when i < lines.length - 1... Fix: count newlines between lines
    bodyCharOffset = 0;
    for (let i = 0; i < bodyLineOffset; i += 1) {
      bodyCharOffset += (lines[i] ?? "").length + 1;
    }
    // If document ends exactly at close fence with no trailing newline after last body line,
    // clamp
    if (bodyCharOffset > text.length) bodyCharOffset = text.length;

    return {
      present: true,
      fields,
      bodyLineOffset,
      bodyCharOffset,
    };
  } catch (err) {
    return {
      present: false,
      reason: err instanceof Error ? err.message : "frontmatter-error",
    };
  }
}

/** Body text after a successful frontmatter parse (normalized). */
export function frontmatterBody(raw: string, result: FrontmatterPresent): string {
  const text = normalizeInput(raw);
  return text.slice(result.bodyCharOffset);
}

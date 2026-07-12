/**
 * Memory category-file parser — tagged, legacy, archived, anti-patterns, raw.
 * Never throws; unmappable entries stay as class "raw".
 */

import type {
  MemoryCategoryEntry,
  MemoryCategoryFile,
  MemoryEntry,
  MemoryEntryClass,
} from "@shared/schemas/snapshot-artefacts.js";
import {
  createRawFallback,
  diagnostic,
  normalizeInput,
  parseHealthDegraded,
  parseHealthOk,
  splitLines,
  withParseFallback,
} from "./primitives/index.js";

export type ParseMemoryOptions = {
  path: string;
  raw: string;
  category?: string;
  mtimeMs?: number;
};

type HeadingBlock = {
  level: number;
  text: string;
  body: string;
  index: number;
};

function categoryFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function splitHeadingBlocks(raw: string): HeadingBlock[] {
  const lines = splitLines(raw);
  const blocks: HeadingBlock[] = [];
  let current: HeadingBlock | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (m?.[1] && m[2]) {
      if (current) blocks.push(current);
      current = {
        level: m[1].length,
        text: m[2].trim(),
        body: "",
        index: blocks.length,
      };
      continue;
    }
    if (current) {
      current.body += (current.body.length > 0 ? "\n" : "") + line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseTags(fragment: string): string[] {
  // Tags live after the date: `### [YYYY-MM-DD] Title  `[domain, type]``
  // Prefer the last `[...]` that is not a YYYY-MM-DD date token.
  const matches = [...fragment.matchAll(/`?\[([^\]]+)\]`?/g)];
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const inner = matches[i]?.[1]?.trim() ?? "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(inner)) continue;
    return inner
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function fieldFromBody(body: string, label: string): string | undefined {
  const re = new RegExp(
    `\\*\\*${label}:\\*\\*\\s*([^\\n]*(?:\\n(?!\\*\\*)[^\\n]*)*)`,
    "i",
  );
  const m = body.match(re);
  return m?.[1]?.trim();
}

function bulletField(body: string, key: string): string | undefined {
  const re = new RegExp(`^\\s*[-*]\\s*${key}\\s*:\\s*(.+)$`, "im");
  const m = body.match(re);
  return m?.[1]?.trim();
}

function classifyHeading(text: string, body: string): MemoryEntry {
  const idBase = text.slice(0, 80);

  // Archived stub: trailing *(archived)*
  if (/\*\(archived\)\*/i.test(text) || /\(archived\)/i.test(text)) {
    const summaryLine = body
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(">"));
    const entry: MemoryEntry = {
      id: `archived:${idBase}`,
      class: "archived",
      title: text.replace(/\s*\*?\(archived\)\*?/gi, "").trim(),
      archived: true,
      tags: parseTags(text),
    };
    if (summaryLine) entry.summary = summaryLine.replace(/^>\s*/, "");
    const dateM = text.match(/\[(\d{4}-\d{2}-\d{2})\]/);
    if (dateM?.[1]) entry.date = dateM[1];
    return entry;
  }

  // Summarized stub: — summarized, see archive/YYYY-MM.md
  const sumM = text.match(
    /—\s*summarized,?\s*see\s+(archive\/[\w.-]+)/i,
  );
  if (sumM) {
    const entry: MemoryEntry = {
      id: `archived:${idBase}`,
      class: "archived",
      title: text.replace(/\s*—\s*summarized.*$/i, "").trim(),
      archived: true,
      archivePointer: sumM[1],
      tags: parseTags(text),
    };
    const dateM = text.match(/\[(\d{4}-\d{2}-\d{2})\]/);
    if (dateM?.[1]) entry.date = dateM[1];
    return entry;
  }

  // Tagged current: ### [YYYY-MM-DD] Title  `[tags]` or [tags]
  const tagged = text.match(
    /^\[(\d{4}-\d{2}-\d{2})\]\s+(.+?)(?:\s+`?\[[^\]]+\]`?)?\s*$/,
  );
  if (tagged?.[1] && tagged[2]) {
    const tags = parseTags(text);
    const entry: MemoryEntry = {
      id: `tagged:${tagged[1]}:${tagged[2].slice(0, 40)}`,
      class: "tagged",
      title: tagged[2].replace(/\s+`?\[[^\]]+\]`?\s*$/, "").trim(),
      date: tagged[1],
      tags,
    };
    const what = fieldFromBody(body, "What");
    const why = fieldFromBody(body, "Why it matters");
    const evidence = fieldFromBody(body, "Evidence");
    if (what) entry.what = what;
    if (why) entry.why = why;
    if (evidence) entry.evidence = evidence;
    return entry;
  }

  // Legacy: ## Short title (YYYY-MM-DD, source-slug)
  const legacy = text.match(/^(.+?)\s*\((\d{4}-\d{2}-\d{2}),\s*([^)]+)\)\s*$/);
  if (legacy?.[1] && legacy[2] && legacy[3]) {
    return {
      id: `legacy:${legacy[2]}:${legacy[3]}`,
      class: "legacy" satisfies MemoryEntryClass,
      title: legacy[1].trim(),
      date: legacy[2],
      sourceSlug: legacy[3].trim(),
      tags: [],
    };
  }

  // Anti-patterns house shape: category heading + frequency/last seen/Recommendation
  const freq = bulletField(body, "frequency");
  const lastSeen = bulletField(body, "last seen") ?? bulletField(body, "last_seen");
  const recommendation =
    bulletField(body, "Recommendation") ?? fieldFromBody(body, "Recommendation");
  if (freq !== undefined || recommendation !== undefined) {
    const entry: MemoryEntry = {
      id: `category:${text}`,
      class: "tagged",
      title: text,
      category: text,
      tags: [],
    };
    if (freq !== undefined) {
      const n = Number.parseFloat(freq);
      if (Number.isFinite(n)) entry.frequency = n;
    }
    if (lastSeen) entry.lastSeen = lastSeen;
    if (recommendation) entry.recommendation = recommendation;
    return entry;
  }

  // Unparsed raw — keep in place
  return {
    id: `raw:${idBase}`,
    class: "raw",
    title: text,
    tags: [],
    rawBody: body.trim() || undefined,
  };
}

function parseMemoryInner(opts: ParseMemoryOptions): MemoryCategoryEntry {
  const raw = normalizeInput(opts.raw);
  const path = opts.path;
  const category = opts.category ?? categoryFromPath(path);

  // Binary / no headings → file-level fallback when content is noise
  const blocks = splitHeadingBlocks(raw);
  const hasHeading = /^#{2,3}\s+/m.test(raw);
  if (!hasHeading && raw.trim().length > 0) {
    // Allow empty-ish files? garbage without headings → fallback
    const printable = [...raw]
      .filter((ch) => {
        const c = ch.charCodeAt(0);
        if (c === 0x09 || c === 0x0a || c === 0x0d || c === 0x20) return false;
        if (c <= 0x1f) return false;
        return true;
      })
      .join("");
    const hasC0 = [...raw].some((ch) => {
      const c = ch.charCodeAt(0);
      return c <= 0x08;
    });
    if (printable.length < 8 || hasC0) {
      return createRawFallback({
        path,
        raw,
        reason: "no-headings",
        mtimeMs: opts.mtimeMs,
        alreadyNormalized: true,
      });
    }
  }

  const entries: MemoryEntry[] = blocks.map((b) =>
    classifyHeading(b.text, b.body),
  );

  const rawCount = entries.filter((e) => e.class === "raw").length;
  const health =
    rawCount > 0 && rawCount === entries.length
      ? parseHealthDegraded("memory", [
          diagnostic("all-raw", "No structured memory entries recognized"),
        ])
      : parseHealthOk("memory", rawCount > 0
          ? [diagnostic("partial-raw", `${rawCount} unparsed entries kept`)]
          : []);

  const node: MemoryCategoryFile = {
    path,
    category,
    entries,
    parseHealth: health,
  };
  if (opts.mtimeMs !== undefined) node.mtimeMs = opts.mtimeMs;
  return node;
}

/** Parse one memory category markdown file. Never throws. */
export function parseMemory(opts: ParseMemoryOptions): MemoryCategoryEntry {
  return withParseFallback(
    opts.path,
    opts.raw,
    () => parseMemoryInner(opts),
    opts.mtimeMs,
  );
}

/**
 * Spec document parser: status block, TL;DR, Components, section index,
 * mermaid fences captured raw. Never throws.
 */

import type {
  SpecEntry,
  SpecNode,
  SpecSection,
} from "@shared/schemas/snapshot-artefacts.js";
import {
  createRawFallback,
  extractH2Section,
  extractNmProgress,
  normalizeInput,
  parseHealthOk,
  parseStatusBlock,
  splitLines,
  withParseFallback,
} from "./primitives/index.js";

export type ParseSpecOptions = {
  path: string;
  raw: string;
  slug?: string;
  mtimeMs?: number;
};

function slugFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.draft\.md$/i, "").replace(/\.md$/i, "");
}

function isDraftPath(path: string): boolean {
  return /\.draft\.md$/i.test(path);
}

function slugifyAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function parseComponents(body: string | undefined): string[] {
  if (!body) return [];
  const items: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*[-*]\s+(.+)$/);
    if (m?.[1]) items.push(m[1].trim());
  }
  return items;
}

function buildSectionIndex(raw: string): SpecSection[] {
  const lines = splitLines(raw);
  type Open = {
    level: number;
    text: string;
    startLine: number;
    sectionNumber?: number;
    mermaidBlocks: string[];
  };
  const open: Open[] = [];
  const closed: SpecSection[] = [];
  let inMermaid = false;
  let mermaidBuf: string[] = [];
  let mermaidOwner: Open | undefined;

  const closeTo = (level: number, endLine: number) => {
    while (open.length > 0) {
      const top = open[open.length - 1];
      if (!top || top.level < level) break;
      open.pop();
      const section: SpecSection = {
        level: top.level,
        text: top.text,
        anchor: slugifyAnchor(top.text),
        startLine: top.startLine,
        endLine,
        mermaidBlocks: top.mermaidBlocks,
      };
      if (top.sectionNumber !== undefined) {
        section.sectionNumber = top.sectionNumber;
      }
      closed.push(section);
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (inMermaid) {
      if (trimmed.startsWith("```")) {
        inMermaid = false;
        if (mermaidOwner) {
          mermaidOwner.mermaidBlocks.push(mermaidBuf.join("\n"));
        }
        mermaidBuf = [];
        mermaidOwner = undefined;
      } else {
        mermaidBuf.push(line);
      }
      continue;
    }

    if (/^```mermaid\b/i.test(trimmed)) {
      inMermaid = true;
      mermaidBuf = [];
      mermaidOwner = open[open.length - 1];
      continue;
    }

    const hm = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (!hm?.[1] || !hm[2]) continue;
    const level = hm[1].length;
    const text = hm[2].trim();
    closeTo(level, i - 1);
    const numM = text.match(/^(\d+)\.\s+/);
    const entry: Open = {
      level,
      text,
      startLine: i,
      mermaidBlocks: [],
    };
    if (numM?.[1]) entry.sectionNumber = Number.parseInt(numM[1], 10);
    open.push(entry);
  }

  // Close remaining
  const lastLine = Math.max(0, lines.length - 1);
  while (open.length > 0) {
    const top = open.pop();
    if (!top) break;
    const section: SpecSection = {
      level: top.level,
      text: top.text,
      anchor: slugifyAnchor(top.text),
      startLine: top.startLine,
      endLine: lastLine,
      mermaidBlocks: top.mermaidBlocks,
    };
    if (top.sectionNumber !== undefined) {
      section.sectionNumber = top.sectionNumber;
    }
    closed.push(section);
  }

  // Document order by startLine
  return closed.sort((a, b) => a.startLine - b.startLine);
}

function parseSpecInner(opts: ParseSpecOptions): SpecEntry {
  const raw = normalizeInput(opts.raw);
  const path = opts.path;
  const slug = opts.slug ?? slugFromPath(path);

  if (raw.trim().length === 0) {
    return createRawFallback({
      path,
      raw,
      reason: "empty",
      mtimeMs: opts.mtimeMs,
      alreadyNormalized: true,
    });
  }

  const status = parseStatusBlock(raw);
  const sections = buildSectionIndex(raw);
  const tldrSection = extractH2Section(raw, "TL;DR") ?? extractH2Section(raw, "TLDR");
  const components = parseComponents(extractH2Section(raw, "Components"));
  const hasTradeoffs = sections.some((s) =>
    /trade-?offs/i.test(s.text),
  );

  const node: SpecNode = {
    path,
    slug,
    draft: isDraftPath(path),
    components,
    sections,
    hasTradeoffs,
    parseHealth: parseHealthOk(status.present ? status.style : "spec"),
  };

  if (status.present) {
    node.statusFields = status.fields;
    if (status.fields["Status"]) node.status = status.fields["Status"];
    if (status.fields["Progress"]) {
      node.progressText = status.fields["Progress"];
      const nm =
        status.progress ?? extractNmProgress(status.fields["Progress"]);
      if (nm) {
        node.progressDone = nm.done;
        node.progressTotal = nm.total;
      }
    }
  }
  if (tldrSection) node.tldr = tldrSection.trim();
  if (opts.mtimeMs !== undefined) node.mtimeMs = opts.mtimeMs;
  return node;
}

/** Parse one spec markdown document. Never throws. */
export function parseSpec(opts: ParseSpecOptions): SpecEntry {
  return withParseFallback(
    opts.path,
    opts.raw,
    () => parseSpecInner(opts),
    opts.mtimeMs,
  );
}

/**
 * Handoff package parser — HANDOFF.md manifest, STATUS word, COMPLETION.md.
 * Takes an in-memory file map; no filesystem IO. Never throws.
 */

import type {
  HandoffCompletion,
  HandoffEntry,
  HandoffPackage,
  HandoffStatus,
} from "@shared/schemas/snapshot-ops.js";
import {
  createRawFallback,
  extractH2Section,
  extractNmProgress,
  normalizeInput,
  parseFieldTable,
  parseHealthOk,
  withParseFallback,
} from "./primitives/index.js";

export type HandoffFileMap = Record<string, string>;

export type ParseHandoffOptions = {
  path: string;
  slug?: string;
  files: HandoffFileMap;
  mtimeMs?: number;
};

const STATUS_WORDS = new Set(["planned", "built", "reviewed"]);

function slugFromPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function parseStatusWord(raw: string | undefined): {
  status: HandoffStatus;
  statusRaw?: string;
} {
  if (raw === undefined) {
    return { status: "unknown" };
  }
  const word = normalizeInput(raw).trim().split(/\s+/)[0] ?? "";
  if (STATUS_WORDS.has(word)) {
    return { status: word as HandoffStatus, statusRaw: word };
  }
  return { status: "unknown", statusRaw: word || raw.trim() };
}

function parseCompletion(raw: string | undefined): HandoffCompletion {
  if (raw === undefined) {
    return { present: false };
  }
  const text = normalizeInput(raw);
  const fields = parseFieldTable(text);
  const completion: HandoffCompletion = {
    present: true,
    raw: text,
  };
  if (fields) completion.fields = fields;
  const resultRaw = fields?.["Result"] ?? "";
  if (/^built\b/i.test(resultRaw.trim())) {
    completion.result = "built";
  } else if (/partial/i.test(resultRaw)) {
    completion.result = "partial";
    const nm = extractNmProgress(resultRaw);
    if (nm) {
      completion.done = nm.done;
      completion.total = nm.total;
    }
  }
  const notes = extractH2Section(text, "Notes");
  if (notes) completion.notes = notes.trim();
  return completion;
}

function parseHandoffInner(opts: ParseHandoffOptions): HandoffEntry {
  const root = opts.path.replace(/\/$/, "");
  const slug = opts.slug ?? slugFromPath(root);
  const handoffMd = opts.files["HANDOFF.md"];
  if (handoffMd === undefined) {
    return createRawFallback({
      path: root,
      raw: "",
      reason: "missing-HANDOFF.md",
      mtimeMs: opts.mtimeMs,
    });
  }

  const raw = normalizeInput(handoffMd);
  const manifestSection =
    extractH2Section(raw, "Manifest") ?? raw;
  const manifest = parseFieldTable(manifestSection);
  const tldr = extractH2Section(raw, "TL;DR") ?? extractH2Section(raw, "TLDR");
  const { status, statusRaw } = parseStatusWord(opts.files["STATUS"]);
  const completion = parseCompletion(opts.files["COMPLETION.md"]);

  const members = Object.keys(opts.files)
    .filter((k) => k.startsWith("artefact/") || k.startsWith("context/"))
    .sort();

  const diagnostics: string[] = [];
  if (status === "built" && !completion.present) {
    diagnostics.push("status-built-without-completion");
  }

  const node: HandoffPackage = {
    path: root,
    slug,
    status,
    completion,
    members,
    diagnostics,
    parseHealth: parseHealthOk("handoff"),
  };
  if (statusRaw !== undefined) node.statusRaw = statusRaw;
  if (manifest) node.manifest = manifest;
  if (tldr) node.tldr = tldr.trim();
  if (opts.mtimeMs !== undefined) node.mtimeMs = opts.mtimeMs;
  return node;
}

/** Parse one handoff package from a file map. Never throws. */
export function parseHandoff(opts: ParseHandoffOptions): HandoffEntry {
  return withParseFallback(
    opts.path,
    opts.files["HANDOFF.md"] ?? "",
    () => parseHandoffInner(opts),
    opts.mtimeMs,
  );
}

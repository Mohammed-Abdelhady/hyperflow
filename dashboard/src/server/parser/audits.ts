/**
 * Audit-file parser: verdict status block + severity-tagged findings + rollup.
 * Never throws.
 */

import type {
  AuditEntry,
  AuditFinding,
  AuditNode,
  AuditSeverity,
  AuditSeverityRollup,
} from "@shared/schemas/snapshot-artefacts.js";
import {
  createRawFallback,
  diagnostic,
  normalizeInput,
  parseHealthOk,
  parseStatusBlock,
  splitLines,
  withParseFallback,
} from "./primitives/index.js";

export type ParseAuditOptions = {
  path: string;
  raw: string;
  slug?: string;
  mtimeMs?: number;
};

const SEVERITIES: AuditSeverity[] = [
  "Critical",
  "Important",
  "Suggestion",
  "Praise",
];

const SEVERITY_SET = new Set<string>(SEVERITIES);

function emptyRollup(): AuditSeverityRollup {
  return { Critical: 0, Important: 0, Suggestion: 0, Praise: 0 };
}

function slugFromPath(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.md$/i, "");
}

function parseFindingsSummary(text: string | undefined): AuditSeverityRollup | undefined {
  if (!text) return undefined;
  const rollup = emptyRollup();
  let any = false;
  for (const sev of SEVERITIES) {
    // Accept "Suggestions" plural for Suggestion
    const label = sev === "Suggestion" ? "Suggestions?" : sev;
    const re = new RegExp(`(\\d+)\\s+${label}`, "i");
    const m = text.match(re);
    if (m?.[1]) {
      rollup[sev] = Number.parseInt(m[1], 10);
      any = true;
    }
  }
  return any ? rollup : undefined;
}

function parseFindingBlocks(raw: string): AuditFinding[] {
  const lines = splitLines(raw);
  const findings: AuditFinding[] = [];
  let current: {
    finding: AuditFinding;
    field?: "issue" | "fix" | "why" | undefined;
    buf: string[];
  } | undefined;

  const flushField = () => {
    if (!current?.field) return;
    const text = current.buf.join("\n").trim();
    if (current.field === "issue") current.finding.issue = text;
    else if (current.field === "fix") current.finding.fix = text;
    else current.finding.why = text;
    current.buf = [];
    delete current.field;
  };

  const flush = () => {
    if (!current) return;
    flushField();
    findings.push(current.finding);
    current = undefined;
  };

  for (const line of lines) {
    const h = line.match(
      /^###\s+\[([^\]]+)\]\s+(.+?)\s*$/,
    );
    if (h?.[1] && h[2]) {
      flush();
      const sevRaw = h[1].trim();
      const rest = h[2].trim();
      // file:line — title  OR  file — title  OR just title
      let file: string | undefined;
      let lineNo: number | undefined;
      let title = rest;
      const fl = rest.match(/^(.+?):(\d+)\s*[—–-]\s*(.+)$/);
      const fOnly = rest.match(/^(.+?)\s*[—–-]\s*(.+)$/);
      if (fl?.[1] && fl[2] && fl[3]) {
        file = fl[1].trim();
        lineNo = Number.parseInt(fl[2], 10);
        title = fl[3].trim();
      } else if (fOnly?.[1] && fOnly[2] && fOnly[1].includes("/")) {
        file = fOnly[1].trim();
        title = fOnly[2].trim();
      }

      if (!SEVERITY_SET.has(sevRaw)) {
        current = {
          finding: {
            severity: "unknown",
            title: rest,
            raw: true,
          },
          buf: [],
        };
        continue;
      }

      const finding: AuditFinding = {
        severity: sevRaw as AuditSeverity,
        title,
      };
      if (file !== undefined) finding.file = file;
      if (lineNo !== undefined) finding.line = lineNo;
      current = { finding, buf: [] };
      continue;
    }

    if (!current) continue;

    const issue = line.match(/^\*\*Issue:\*\*\s*(.*)$/i);
    const fix = line.match(/^\*\*Fix:\*\*\s*(.*)$/i);
    const why = line.match(/^\*\*Why it matters:\*\*\s*(.*)$/i);
    if (issue) {
      flushField();
      current.field = "issue";
      current.buf = [issue[1] ?? ""];
      continue;
    }
    if (fix) {
      flushField();
      current.field = "fix";
      current.buf = [fix[1] ?? ""];
      continue;
    }
    if (why) {
      flushField();
      current.field = "why";
      current.buf = [why[1] ?? ""];
      continue;
    }
    if (current.field) current.buf.push(line);
  }
  flush();
  return findings;
}

function rollupFromFindings(findings: AuditFinding[]): AuditSeverityRollup {
  const rollup = emptyRollup();
  for (const f of findings) {
    if (f.severity === "unknown" || f.raw) continue;
    rollup[f.severity] += 1;
  }
  return rollup;
}

function parseAuditInner(opts: ParseAuditOptions): AuditEntry {
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
  const findings = parseFindingBlocks(raw);
  const rollup = rollupFromFindings(findings);
  const findingsSummary = status.present
    ? parseFindingsSummary(status.fields["Findings"])
    : undefined;

  const diagnostics = [];
  if (findingsSummary) {
    for (const sev of SEVERITIES) {
      if (findingsSummary[sev] !== rollup[sev]) {
        diagnostics.push(
          diagnostic(
            "findings-count-mismatch",
            `Findings row ${sev}=${findingsSummary[sev]} vs body=${rollup[sev]}`,
            { severity: sev, row: findingsSummary[sev], body: rollup[sev] },
          ),
        );
      }
    }
  }

  const sourceMatch = raw.match(/>\s*Source:\s*(.+\.md)/i);

  const node: AuditNode = {
    path,
    slug,
    findings,
    rollup,
    parseHealth: parseHealthOk(
      status.present ? status.style : "audit",
      diagnostics,
    ),
  };
  if (status.present) {
    node.statusFields = status.fields;
    if (status.fields["Verdict"]) {
      node.verdict = status.fields["Verdict"].replace(/^`|`$/g, "");
    }
  }
  if (findingsSummary) node.findingsSummary = findingsSummary;
  if (sourceMatch?.[1]) node.source = sourceMatch[1].trim();
  if (opts.mtimeMs !== undefined) node.mtimeMs = opts.mtimeMs;
  return node;
}

/** Parse one audit markdown file. Never throws. */
export function parseAudit(opts: ParseAuditOptions): AuditEntry {
  return withParseFallback(
    opts.path,
    opts.raw,
    () => parseAuditInner(opts),
    opts.mtimeMs,
  );
}

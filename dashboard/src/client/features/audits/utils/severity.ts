import type { AuditSeverity } from "@shared/schemas/index.js";
import type { SemanticState } from "../../../constants/state-tokens";

export const SEVERITY_ORDER = [
  "Critical",
  "Important",
  "Suggestion",
  "Praise",
  "unknown",
] as const;

export type SeverityKey = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_LABELS: Readonly<Record<SeverityKey, string>> = {
  Critical: "Critical",
  Important: "Important",
  Suggestion: "Suggestion",
  Praise: "Praise",
  unknown: "Unknown",
};

export const SEVERITY_STATE: Readonly<Record<SeverityKey, SemanticState>> = {
  Critical: "blocked",
  Important: "fix",
  Suggestion: "queued",
  Praise: "pass",
  unknown: "queued",
};

export const SEVERITY_DOT_COLOR: Readonly<Record<SeverityKey, string>> = {
  Critical: "var(--state-blocked)",
  Important: "var(--state-fix)",
  Suggestion: "var(--state-queued)",
  Praise: "var(--state-pass)",
  unknown: "var(--text-dim)",
};

export function normalizeSeverity(raw: string | undefined): SeverityKey {
  if (!raw) return "unknown";
  if ((SEVERITY_ORDER as readonly string[]).includes(raw)) {
    return raw as SeverityKey;
  }
  const lower = raw.trim().toLowerCase();
  if (lower === "critical") return "Critical";
  if (lower === "important") return "Important";
  if (lower === "suggestion") return "Suggestion";
  if (lower === "praise") return "Praise";
  return "unknown";
}

export function severityRank(s: AuditSeverity | string): number {
  const key = normalizeSeverity(s);
  return SEVERITY_ORDER.indexOf(key);
}

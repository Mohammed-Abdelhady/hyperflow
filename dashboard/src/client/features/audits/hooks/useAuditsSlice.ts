import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  AuditEntry,
  AuditFinding,
  AuditNode,
} from "@shared/schemas/index.js";
import { useSnapshotSlice, useUiSlice } from "../../../hooks/use-slice";
import { selectAudits } from "../../../utils/selectors";
import { normalizeSeverity, type SeverityKey } from "../utils/severity";

export interface AuditListItem {
  slug: string;
  path: string;
  title: string;
  mtimeMs?: number;
  verdict?: string;
  parseError: boolean;
  totalFindings: number;
}

function toItem(entry: AuditEntry): AuditListItem {
  if (isRawEntry(entry)) {
    return {
      slug: entry.path,
      path: entry.path,
      title: entry.path.split("/").pop() ?? entry.path,
      ...(entry.mtimeMs !== undefined ? { mtimeMs: entry.mtimeMs } : {}),
      parseError: true,
      totalFindings: 0,
    };
  }
  const node = entry as AuditNode;
  const total =
    node.rollup.Critical +
    node.rollup.Important +
    node.rollup.Suggestion +
    node.rollup.Praise;
  return {
    slug: node.slug,
    path: node.path,
    title: node.slug,
    ...(node.mtimeMs !== undefined ? { mtimeMs: node.mtimeMs } : {}),
    ...(node.verdict !== undefined ? { verdict: node.verdict } : {}),
    parseError: false,
    totalFindings: total,
  };
}

const SURFACE = "audits";
/** Stable empty filter — never allocate `{}` inside a Zustand selector. */
const EMPTY_FILTER: Readonly<Record<string, unknown>> = Object.freeze({});

export function useAuditsSlice() {
  const audits = useSnapshotSlice((s) => selectAudits(s.data));
  const filter = useUiSlice(
    (s) => s.filterBySurface[SURFACE] ?? EMPTY_FILTER,
  );
  const setFilter = useUiSlice((s) => s.setFilter);

  const items = useMemo(() => {
    const list = audits.map(toItem);
    list.sort((a, b) => {
      const am = a.mtimeMs ?? 0;
      const bm = b.mtimeMs ?? 0;
      return bm - am || a.slug.localeCompare(b.slug);
    });
    return list;
  }, [audits]);

  const bySlug = useMemo(() => {
    const map = new Map<string, AuditEntry>();
    for (const a of audits) {
      if (isRawEntry(a)) map.set(a.path, a);
      else map.set((a as AuditNode).slug, a);
    }
    return map;
  }, [audits]);

  const severityFilter = (filter["severity"] as string | null) ?? null;

  function findingsFor(
    entry: AuditEntry | null,
  ): { findings: AuditFinding[]; rollup: AuditNode["rollup"] | null } {
    if (!entry || isRawEntry(entry)) {
      return { findings: [], rollup: null };
    }
    const node = entry as AuditNode;
    let findings = node.findings;
    if (severityFilter) {
      const key = normalizeSeverity(severityFilter) as SeverityKey;
      findings = findings.filter(
        (f) => normalizeSeverity(f.severity) === key,
      );
    }
    return { findings, rollup: node.rollup };
  }

  return {
    items,
    bySlug,
    audits,
    empty: items.length === 0,
    severityFilter,
    setSeverityFilter: (severity: string | null) =>
      setFilter(SURFACE, { ...filter, severity }),
    findingsFor,
  };
}

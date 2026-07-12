import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { AuditEntry, AuditNode } from "@shared/schemas/index.js";
import type { HeatmapIntensity } from "../../../constants/state-tokens";

export interface HeatmapCellModel {
  auditSlug: string;
  intensity: HeatmapIntensity;
  total: number;
  breakdown: string;
  valueLabel: string;
}

export interface HeatmapModel {
  singleAudit: boolean;
  cells: HeatmapCellModel[];
  note: string | null;
}

function intensityFromCount(count: number, max: number): HeatmapIntensity {
  if (max <= 0 || count <= 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.2) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.7) return 3;
  return 4;
}

export function buildHeatmapModel(audits: readonly AuditEntry[]): HeatmapModel {
  const nodes: AuditNode[] = [];
  for (const a of audits) {
    if (!isRawEntry(a)) nodes.push(a as AuditNode);
  }

  if (nodes.length === 0) {
    return { singleAudit: false, cells: [], note: null };
  }

  const totals = nodes.map(
    (n) =>
      n.rollup.Critical +
      n.rollup.Important +
      n.rollup.Suggestion +
      n.rollup.Praise,
  );
  const max = Math.max(...totals, 1);

  const cells: HeatmapCellModel[] = nodes.map((n, i) => {
    const total = totals[i] ?? 0;
    const breakdown = `Critical ${n.rollup.Critical} · Important ${n.rollup.Important} · Suggestion ${n.rollup.Suggestion} · Praise ${n.rollup.Praise}`;
    return {
      auditSlug: n.slug,
      intensity: intensityFromCount(total, max),
      total,
      breakdown,
      valueLabel: `${n.slug}: ${total} findings — ${breakdown}`,
    };
  });

  const singleAudit = nodes.length === 1;
  return {
    singleAudit,
    cells,
    note: singleAudit
      ? "Trends appear from the second audit onward"
      : null,
  };
}

export function useHeatmapModel(audits: readonly AuditEntry[]): HeatmapModel {
  return useMemo(() => buildHeatmapModel(audits), [audits]);
}

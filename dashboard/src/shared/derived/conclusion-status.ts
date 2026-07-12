import type { ProgressCounts } from "@shared/schemas/index.js";

export type ConclusionStatus = "pending" | "running" | "completed" | "unknown";

export function normalizeStatus(raw: string | undefined): ConclusionStatus {
  if (!raw) return "unknown";
  const s = raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (["pending", "planned", "not_started", "todo"].includes(s)) return "pending";
  if (["running", "in_progress", "active", "dispatching"].includes(s)) {
    return "running";
  }
  if (["completed", "done", "complete", "shipped", "passed"].includes(s)) {
    return "completed";
  }
  return "unknown";
}

export function statusFromProgress(
  progress: ProgressCounts,
  explicit: ConclusionStatus,
): ConclusionStatus {
  if (explicit !== "unknown") return explicit;
  if (progress.total <= 0) return "pending";
  if (progress.done >= progress.total && progress.running === 0) {
    return "completed";
  }
  if (progress.running > 0 || progress.done > 0) return "running";
  return "pending";
}

export function progressRatio(progress: ProgressCounts): number {
  if (progress.total <= 0) return 0;
  const r = progress.done / progress.total;
  if (!Number.isFinite(r)) return 0;
  return Math.min(1, Math.max(0, r));
}

export function progressSoFarText(
  status: ConclusionStatus,
  progress: ProgressCounts,
): string {
  const { done, running, pending, total } = progress;
  if (total <= 0) {
    return status === "pending"
      ? "0 / 0 sub-tasks (not started)"
      : "no sub-tasks tracked";
  }
  const pct = Math.round(progressRatio(progress) * 100);
  if (status === "completed") {
    return `${done} / ${total} sub-tasks complete (${pct}%)`;
  }
  if (status === "running") {
    return `${done} / ${total} done · ${running} running · ${pending} pending (${pct}%)`;
  }
  return `${done} / ${total} sub-tasks · ${pending} pending (${pct}%)`;
}

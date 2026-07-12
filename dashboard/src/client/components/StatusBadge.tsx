import { memo } from "react";
import {
  STATE_TOKEN_MAP,
  VERDICT_STATE_MAP,
  type SemanticState,
} from "../constants/state-tokens";

export interface StatusBadgeProps {
  /** Verdict vocabulary rendered uppercase (PASS · NEEDS_FIX · …). */
  verdict: string;
  testId?: string;
}

function resolveState(verdict: string): SemanticState {
  const key = verdict.trim().toUpperCase();
  return VERDICT_STATE_MAP[key] ?? "queued";
}

function StatusBadgeImpl({
  verdict,
  testId = "status-badge",
}: StatusBadgeProps) {
  const normalized = verdict.trim().toUpperCase();
  const state = resolveState(verdict);
  const tokens = STATE_TOKEN_MAP[state];
  const label =
    normalized in VERDICT_STATE_MAP ? normalized : tokens.label;

  return (
    <span
      className="hf-status-badge"
      data-testid={testId}
      data-state={state}
      style={{ background: tokens.dim, color: tokens.color }}
    >
      {label}
    </span>
  );
}

export const StatusBadge = memo(StatusBadgeImpl);

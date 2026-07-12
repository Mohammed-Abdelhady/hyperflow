import { memo } from "react";
import {
  STATE_TOKEN_MAP,
  type SemanticState,
} from "../constants/state-tokens";
import { useReducedMotion } from "../hooks/use-reduced-motion";

export interface StageChipProps {
  label: string;
  state: SemanticState;
  /** 0..1 progress for determinate in-flight hairline; omit for indeterminate. */
  progress?: number;
  indeterminate?: boolean;
  testId?: string;
}

function StageChipImpl({
  label,
  state,
  progress,
  indeterminate = false,
  testId = "stage-chip",
}: StageChipProps) {
  const reduced = useReducedMotion();
  const tokens = STATE_TOKEN_MAP[state];
  const showHairline =
    !reduced && (indeterminate || typeof progress === "number");

  return (
    <span
      className="hf-stage-chip"
      data-testid={testId}
      data-state={state}
      style={{ background: tokens.dim, color: tokens.color }}
    >
      <span className="hf-stage-chip__layer">{label}</span>
      {showHairline ? (
        <span
          className={
            indeterminate
              ? "hf-stage-chip__hairline hf-stage-chip__hairline--indeterminate"
              : "hf-stage-chip__hairline"
          }
          data-testid={`${testId}-hairline`}
          style={
            !indeterminate && typeof progress === "number"
              ? { transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }
              : undefined
          }
          aria-hidden
        />
      ) : null}
    </span>
  );
}

export const StageChip = memo(StageChipImpl);

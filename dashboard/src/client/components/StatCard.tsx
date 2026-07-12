import { memo } from "react";
import type { SemanticState } from "../constants/state-tokens";
import { STATE_TOKEN_MAP } from "../constants/state-tokens";

export interface StatCardProps {
  caption: string;
  value: string;
  delta?: string;
  deltaState?: SemanticState;
  testId?: string;
}

function StatCardImpl({
  caption,
  value,
  delta,
  deltaState = "queued",
  testId = "stat-card",
}: StatCardProps) {
  const tokens = STATE_TOKEN_MAP[deltaState];
  return (
    <article className="hf-stat-card" data-testid={testId}>
      <div className="hf-stat-card__caption">{caption}</div>
      <div className="hf-stat-card__value" data-testid={`${testId}-value`}>
        {value}
      </div>
      {delta !== undefined ? (
        <div
          className="hf-stat-card__delta"
          style={{ color: tokens.color }}
          data-testid={`${testId}-delta`}
        >
          {delta}
        </div>
      ) : null}
    </article>
  );
}

export const StatCard = memo(StatCardImpl);

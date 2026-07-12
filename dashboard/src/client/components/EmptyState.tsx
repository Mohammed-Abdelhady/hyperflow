import { memo } from "react";

export interface EmptyStateProps {
  fact: string;
  actionLabel?: string;
  onAction?: () => void;
  testId?: string;
}

function EmptyStateImpl({
  fact,
  actionLabel,
  onAction,
  testId = "empty-state",
}: EmptyStateProps) {
  return (
    <div className="hf-empty-state" data-testid={testId}>
      <p data-testid={`${testId}-fact`}>{fact}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="hf-empty-state__action"
          data-testid={`${testId}-action`}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export const EmptyState = memo(EmptyStateImpl);

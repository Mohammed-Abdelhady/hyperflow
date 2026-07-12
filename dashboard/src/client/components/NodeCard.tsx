import { memo, type KeyboardEvent } from "react";
import type { SemanticState } from "../constants/state-tokens";
import { STATE_TOKEN_MAP } from "../constants/state-tokens";

export interface NodePort {
  id: string;
  state?: SemanticState;
}

export interface NodeCardProps {
  title: string;
  typeTag: string;
  costLabel?: string;
  ports?: readonly NodePort[];
  selected?: boolean;
  onSelect?: () => void;
  testId?: string;
}

function NodeCardImpl({
  title,
  typeTag,
  costLabel,
  ports = [],
  selected = false,
  onSelect,
  testId = "node-card",
}: NodeCardProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={
        selected ? "hf-node-card hf-node-card--selected" : "hf-node-card"
      }
      data-testid={testId}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <div className="hf-node-card__type">{typeTag}</div>
      <div className="hf-node-card__title">{title}</div>
      {ports.length > 0 ? (
        <div className="hf-node-card__ports" aria-hidden>
          {ports.map((p) => (
            <span
              key={p.id}
              className="hf-node-card__port"
              style={{
                background: STATE_TOKEN_MAP[p.state ?? "queued"].color,
              }}
            />
          ))}
        </div>
      ) : null}
      {costLabel !== undefined ? (
        <div className="hf-node-card__cost" data-testid={`${testId}-cost`}>
          {costLabel}
        </div>
      ) : null}
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);

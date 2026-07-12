import { memo } from "react";
import {
  STATE_TOKEN_MAP,
  type SemanticState,
} from "../constants/state-tokens";

export interface EventRowProps {
  timestamp: string;
  message: string;
  severity?: SemanticState;
  /** When false, skip entry animation (re-windowed rows). */
  animateEnter?: boolean;
  testId?: string;
}

function EventRowImpl({
  timestamp,
  message,
  severity = "queued",
  animateEnter = true,
  testId = "event-row",
}: EventRowProps) {
  const color = STATE_TOKEN_MAP[severity].color;
  return (
    <div
      className={
        animateEnter ? "hf-event-row" : "hf-event-row hf-event-row--static"
      }
      data-testid={testId}
      data-severity={severity}
    >
      <span
        className="hf-event-row__dot"
        style={{ background: color }}
        aria-hidden
      />
      <span className="hf-event-row__ts">{timestamp}</span>
      <span className="hf-event-row__msg">{message}</span>
    </div>
  );
}

export const EventRow = memo(EventRowImpl);

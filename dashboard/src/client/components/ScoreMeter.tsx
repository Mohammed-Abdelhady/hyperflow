import NumberFlow from "@number-flow/react";
import { memo, useEffect, useRef, useState } from "react";
import {
  STATE_TOKEN_MAP,
  type SemanticState,
} from "../constants/state-tokens";
import { useReducedMotion } from "../hooks/use-reduced-motion";

export interface ScoreMeterProps {
  value: number;
  /** Threshold map for recolor — first matching max wins. */
  thresholds?: readonly { max: number; state: SemanticState }[];
  testId?: string;
}

const DEFAULT_THRESHOLDS: readonly { max: number; state: SemanticState }[] = [
  { max: 40, state: "blocked" },
  { max: 70, state: "fix" },
  { max: 100, state: "pass" },
];

function stateForValue(
  value: number,
  thresholds: readonly { max: number; state: SemanticState }[],
): SemanticState {
  for (const t of thresholds) {
    if (value <= t.max) return t.state;
  }
  return "pass";
}

const R = 52;
const C = 2 * Math.PI * R;
const ARC = C * 0.75;

function ScoreMeterImpl({
  value,
  thresholds = DEFAULT_THRESHOLDS,
  testId = "score-meter",
}: ScoreMeterProps) {
  const reduced = useReducedMotion();
  const state = stateForValue(value, thresholds);
  const color = STATE_TOKEN_MAP[state].color;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = ARC - (ARC * clamped) / 100;

  const lastChange = useRef(0);
  const [snap, setSnap] = useState(false);

  useEffect(() => {
    const now = performance.now();
    // motion-sweep is 450ms — faster updates snap the numeral.
    if (now - lastChange.current < 450) setSnap(true);
    else setSnap(false);
    lastChange.current = now;
  }, [clamped]);

  return (
    <div
      className="hf-score-meter"
      data-testid={testId}
      data-state={state}
      style={{ color }}
    >
      <svg className="hf-score-meter__svg" viewBox="0 0 120 120" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth="6"
          strokeDasharray={`${ARC} ${C}`}
          transform="rotate(135 60 60)"
        />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${ARC} ${C}`}
          strokeDashoffset={offset}
          transform="rotate(135 60 60)"
          style={{
            transition:
              reduced || snap
                ? "none"
                : "stroke-dashoffset var(--motion-sweep) var(--ease-out)",
          }}
          data-testid={`${testId}-sweep`}
        />
      </svg>
      <div className="hf-score-meter__value" data-testid={`${testId}-value`}>
        {reduced || snap ? (
          Math.round(clamped)
        ) : (
          <NumberFlow value={Math.round(clamped)} />
        )}
      </div>
    </div>
  );
}

export const ScoreMeter = memo(ScoreMeterImpl);

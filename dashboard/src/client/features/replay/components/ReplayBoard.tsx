import { memo } from "react";
import { EventRow } from "../../../components/EventRow";
import { StageChip } from "../../../components/StageChip";
import type { SemanticState } from "../../../constants/state-tokens";
import { formatTimeOfDay } from "../../../utils/format";
import type { TimelineBoundary } from "../hooks/timeline-index";

export interface ReplayBoardProps {
  current: TimelineBoundary | null;
  window: readonly TimelineBoundary[];
  testId?: string;
}

function severityFor(label: string): SemanticState {
  const u = label.toUpperCase();
  if (u.includes("FAIL") || u.includes("BLOCK")) return "blocked";
  if (u.includes("WARN") || u.includes("FIX")) return "fix";
  if (u.includes("PASS") || u.includes("DONE")) return "pass";
  if (u.includes("START") || u.includes("RUN")) return "live";
  return "queued";
}

function ReplayBoardImpl({
  current,
  window,
  testId = "replay-board",
}: ReplayBoardProps) {
  return (
    <div className="hf-replay__board" data-testid={testId}>
      <div data-testid={`${testId}-stage`}>
        {current ? (
          <StageChip
            label={current.stageKey ?? current.label}
            state={severityFor(current.label)}
            testId={`${testId}-chip`}
          />
        ) : (
          <StageChip
            label="—"
            state="queued"
            testId={`${testId}-chip-empty`}
          />
        )}
      </div>
      <div
        className="hf-analytics__panel"
        style={{ marginTop: "var(--sp-4)" }}
        data-testid={`${testId}-stream`}
      >
        {window.length === 0 ? (
          <p className="hf-replay__note" data-testid={`${testId}-empty`}>
            No events at this scrub position.
          </p>
        ) : (
          window.map((b) => (
            <EventRow
              key={b.eventId}
              timestamp={b.ts ? formatTimeOfDay(b.ts) : "—"}
              message={b.label}
              severity={severityFor(b.label)}
              animateEnter={false}
              testId={`${testId}-row-${b.eventId}`}
            />
          ))
        )}
      </div>
      {current ? (
        <p
          className="hf-replay__note"
          data-testid={`${testId}-current-label`}
          aria-live="polite"
        >
          {current.label}
        </p>
      ) : null}
    </div>
  );
}

export const ReplayBoard = memo(ReplayBoardImpl);

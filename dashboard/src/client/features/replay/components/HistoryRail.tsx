import { memo, type KeyboardEvent } from "react";
import { formatDateTime } from "../../../utils/format";

export interface HistoryRun {
  id: string;
  label: string;
  startedAt: string | number | Date;
  eventCount: number;
}

export interface HistoryRailProps {
  runs: readonly HistoryRun[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  testId?: string;
}

function HistoryRailImpl({
  runs,
  selectedId,
  onSelect,
  testId = "replay-history",
}: HistoryRailProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <aside className="hf-replay__rail" data-testid={testId}>
      <h2 className="hf-replay__rail-title">Runs</h2>
      {runs.length === 0 ? (
        <p className="hf-replay__note" data-testid={`${testId}-empty`}>
          No recorded runs. Events appear here after a chain emits
          events.ndjson lines.
        </p>
      ) : (
        runs.map((run) => {
          const selected = run.id === selectedId;
          return (
            <div
              key={run.id}
              role="option"
              aria-selected={selected}
              tabIndex={0}
              className={
                selected
                  ? "hf-roster-row hf-roster-row--selected"
                  : "hf-roster-row"
              }
              data-testid={`${testId}-row-${run.id}`}
              onClick={() => onSelect(run.id)}
              onKeyDown={(e) => onKeyDown(e, run.id)}
            >
              <span aria-hidden />
              <span className="hf-roster-row__title">{run.label}</span>
              <span className="hf-roster-row__meta">
                {formatDateTime(run.startedAt)} · {run.eventCount}
              </span>
            </div>
          );
        })
      )}
    </aside>
  );
}

export const HistoryRail = memo(HistoryRailImpl);

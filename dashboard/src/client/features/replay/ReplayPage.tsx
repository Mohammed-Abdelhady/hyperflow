import { useMemo, useState } from "react";
import { useSnapshotData } from "../../hooks/use-slice";
import type { ChainStage } from "../../utils/chainline-geometry";
import { formatTokens } from "../../utils/format";
import { selectTokenAnalytics } from "../../utils/selectors";
import { HistoryRail, type HistoryRun } from "./components/HistoryRail";
import { ReplayBoard } from "./components/ReplayBoard";
import { ScrubHeader } from "./components/ScrubHeader";
import { useEventsRange } from "./hooks/use-events-range";
import { useScrubInteraction } from "./hooks/use-scrub-interaction";
import { useTimelineIndex } from "./hooks/use-timeline-index";

function deriveRuns(
  eventCount: number,
  reducedFidelity: boolean,
): HistoryRun[] {
  if (eventCount === 0 && reducedFidelity) return [];
  if (eventCount === 0) return [];
  return [
    {
      id: "current",
      label: "Current run",
      startedAt: Date.now(),
      eventCount,
    },
  ];
}

export function ReplayPage() {
  const snapshot = useSnapshotData();
  const index = useTimelineIndex();
  const scrub = useScrubInteraction(index);
  const [selectedRun, setSelectedRun] = useState<string | null>("current");

  // Fetch full range when scrubbing near edges of sparse store.
  const needsRange =
    index.eventCount > 0 &&
    (scrub.eventIndex === 0 || scrub.eventIndex >= index.eventCount - 1);
  const fromTs = index.eventBoundaries[0]?.ts;
  const toTs =
    index.eventBoundaries[index.eventBoundaries.length - 1]?.ts;
  const rangeParams: {
    enabled: boolean;
    from?: string;
    to?: string;
  } = {
    enabled: needsRange && !index.degraded,
  };
  if (fromTs) rangeParams.from = fromTs;
  if (toTs) rangeParams.to = toTs;
  const range = useEventsRange(rangeParams);

  const tokens = selectTokenAnalytics(snapshot);
  const stages: ChainStage[] = useMemo(() => {
    if (index.stageKeys.length === 0) {
      return [{ id: "run", label: "Run" }];
    }
    return index.stageKeys.map((key) => {
      const cost = tokens?.byBatch.find((b) => b.batch === key)?.tokens;
      const stage: ChainStage = { id: key, label: key };
      if (cost !== undefined && cost > 0) {
        stage.costLabel = formatTokens(cost);
      }
      return stage;
    });
  }, [index.stageKeys, tokens]);

  const runs = deriveRuns(
    index.eventCount,
    snapshot?.events.reducedFidelity === true,
  );

  const current =
    index.eventBoundaries[scrub.eventIndex] ??
    index.eventBoundaries[0] ??
    null;
  const window = index.eventBoundaries.slice(
    Math.max(0, scrub.eventIndex - 8),
    scrub.eventIndex + 1,
  );

  return (
    <div className="hf-replay" data-testid="surface-replay">
      <HistoryRail
        runs={runs}
        selectedId={selectedRun}
        onSelect={setSelectedRun}
      />
      <div className="hf-replay__main">
        <ScrubHeader
          index={index}
          scrub={scrub}
          stages={stages}
          stale={range.stale}
        />
        <ReplayBoard current={current} window={window} />
      </div>
    </div>
  );
}

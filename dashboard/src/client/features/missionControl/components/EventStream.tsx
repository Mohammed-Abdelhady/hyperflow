import { memo, useMemo, useState } from "react";
import { EventRow } from "../../../components/EventRow";
import type { SemanticState } from "../../../constants/state-tokens";
import { ROW_HEIGHT_DENSE } from "../../../constants/motion";
import { useVirtualList } from "../../../hooks/use-virtual-list";
import { formatTimeOfDay } from "../../../utils/format";
import { useStreamCoalesce } from "../hooks/use-stream-coalesce";
import { StreamFilters } from "./StreamFilters";

export interface EventStreamProps {
  testId?: string;
}

function EventStreamImpl({ testId = "mission-event-stream" }: EventStreamProps) {
  const { rows } = useStreamCoalesce();
  const [filter, setFilter] = useState<SemanticState | "all">("all");
  const filtered = useMemo(
    () =>
      filter === "all" ? rows : rows.filter((r) => r.severity === filter),
    [rows, filter],
  );

  const viewportHeight = 160;
  const {
    startIndex,
    endIndex,
    offsetY,
    totalHeight,
    onScroll,
    scrollRef,
    pinned,
    pinToBottom,
  } = useVirtualList({
    itemCount: filtered.length,
    rowHeight: ROW_HEIGHT_DENSE,
    viewportHeight,
    autoFollow: true,
  });

  const visible = filtered.slice(startIndex, endIndex);

  return (
    <div data-testid={testId} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <StreamFilters active={filter} onChange={setFilter} />
      {!pinned ? (
        <div style={{ paddingInline: "var(--sp-3)", paddingBlock: "var(--sp-1)" }}>
          <button
            type="button"
            className="hf-stream-follow"
            data-testid={`${testId}-follow`}
            onClick={pinToBottom}
          >
            Follow latest
          </button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="hf-stream-list"
        data-testid={`${testId}-list`}
        style={{ height: viewportHeight }}
        onScroll={onScroll}
        role="list"
        tabIndex={0}
      >
        <div
          className="hf-stream-list__spacer"
          style={{ height: totalHeight }}
        >
          <div
            className="hf-stream-list__window"
            style={{ transform: `translateY(${offsetY}px)` }}
          >
            {visible.map((row, i) => (
              <div
                key={row.id}
                role="listitem"
                tabIndex={0}
                style={{
                  height: ROW_HEIGHT_DENSE,
                  contentVisibility: "auto",
                  containIntrinsicSize: `${ROW_HEIGHT_DENSE}px`,
                }}
                data-testid={`${testId}-item-${row.id}`}
                data-marker={row.marker ? "true" : "false"}
              >
                <EventRow
                  timestamp={
                    row.timestamp ? formatTimeOfDay(row.timestamp) : "—"
                  }
                  message={row.message}
                  severity={row.severity}
                  animateEnter={row.animateEnter && i < 3}
                  testId={`${testId}-row-${row.id}`}
                />
              </div>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <p
            className="hf-replay__note"
            style={{ padding: "var(--sp-3)" }}
            data-testid={`${testId}-empty`}
          >
            No events in the current window.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export const EventStream = memo(EventStreamImpl);

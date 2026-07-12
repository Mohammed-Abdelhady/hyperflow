import { memo, useMemo } from "react";
import { RosterRow } from "../../../components/RosterRow";
import { ROW_HEIGHT_DEFAULT } from "../../../constants/motion";
import { useVirtualList } from "../../../hooks/use-virtual-list";
import type { MemoryEntryView } from "../utils/graph-model";

export interface MemoryRailProps {
  entries: readonly MemoryEntryView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate?: () => void;
  observeMode: boolean;
  testId?: string;
}

const VIEWPORT = 480;

function MemoryRailImpl({
  entries,
  selectedId,
  onSelect,
  onCreate,
  observeMode,
  testId = "memory-rail",
}: MemoryRailProps) {
  const virtual = useVirtualList({
    itemCount: entries.length,
    rowHeight: ROW_HEIGHT_DEFAULT,
    viewportHeight: VIEWPORT,
    autoFollow: false,
  });

  const windowItems = useMemo(
    () => entries.slice(virtual.startIndex, virtual.endIndex),
    [entries, virtual.startIndex, virtual.endIndex],
  );

  return (
    <div className="hf-browser-rail" data-testid={testId}>
      <h2 className="hf-browser-rail__title">Memory</h2>
      {onCreate ? (
        <button
          type="button"
          className="hf-btn"
          style={{ margin: "var(--sp-2)" }}
          data-testid={`${testId}-create`}
          disabled={observeMode}
          title={observeMode ? "Observe mode — writes disabled" : undefined}
          onClick={onCreate}
        >
          New entry
        </button>
      ) : null}
      <div
        className="hf-browser-rail__list"
        ref={virtual.scrollRef}
        onScroll={virtual.onScroll}
        style={{ height: VIEWPORT }}
        data-testid={`${testId}-list`}
        role="listbox"
        aria-label="Memory entries"
      >
        <div
          className="hf-stream-list__spacer"
          style={{ height: virtual.totalHeight }}
        >
          <div
            className="hf-stream-list__window"
            style={{ transform: `translateY(${virtual.offsetY}px)` }}
          >
            {windowItems.map((item, i) => (
              <RosterRow
                key={item.id}
                title={item.title}
                meta={item.category}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
                testId={`${testId}-row-${virtual.startIndex + i}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const MemoryRail = memo(MemoryRailImpl);

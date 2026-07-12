import { memo, useMemo } from "react";
import type { AuditFinding, AuditSeverityRollup } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { ROW_HEIGHT_DEFAULT } from "../../../constants/motion";
import { useVirtualList } from "../../../hooks/use-virtual-list";
import { FindingRow } from "./FindingRow";
import { SeverityFilters } from "./SeverityFilters";

export interface FindingsListProps {
  findings: readonly AuditFinding[];
  rollup: AuditSeverityRollup | null;
  severityFilter: string | null;
  onSeverityFilter: (severity: string | null) => void;
  testId?: string;
}

const VIEWPORT = 360;

function FindingsListImpl({
  findings,
  rollup,
  severityFilter,
  onSeverityFilter,
  testId = "findings-list",
}: FindingsListProps) {
  const virtual = useVirtualList({
    itemCount: findings.length,
    rowHeight: ROW_HEIGHT_DEFAULT,
    viewportHeight: VIEWPORT,
    autoFollow: false,
  });

  const windowItems = useMemo(
    () => findings.slice(virtual.startIndex, virtual.endIndex),
    [findings, virtual.startIndex, virtual.endIndex],
  );

  return (
    <div className="hf-findings" data-testid={testId}>
      {rollup ? (
        <div data-testid={`${testId}-rollup`} className="hf-replay__note">
          Critical {rollup.Critical} · Important {rollup.Important} · Suggestion{" "}
          {rollup.Suggestion} · Praise {rollup.Praise}
        </div>
      ) : null}
      <SeverityFilters active={severityFilter} onChange={onSeverityFilter} />
      {findings.length === 0 ? (
        <EmptyState
          fact="No findings match the current filter."
          testId={`${testId}-empty`}
        />
      ) : (
        <div
          className="hf-findings__viewport"
          ref={virtual.scrollRef}
          onScroll={virtual.onScroll}
          style={{ height: VIEWPORT }}
          data-testid={`${testId}-viewport`}
        >
          <div
            className="hf-stream-list__spacer"
            style={{ height: virtual.totalHeight }}
          >
            <div
              className="hf-stream-list__window"
              style={{ transform: `translateY(${virtual.offsetY}px)` }}
              data-testid={`${testId}-window`}
            >
              {windowItems.map((f, i) => (
                <FindingRow
                  key={`${virtual.startIndex + i}-${f.title}`}
                  finding={f}
                  testId={`${testId}-row-${virtual.startIndex + i}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const FindingsList = memo(FindingsListImpl);

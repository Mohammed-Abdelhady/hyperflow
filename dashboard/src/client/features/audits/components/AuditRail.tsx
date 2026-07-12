import { memo, useCallback, type KeyboardEvent } from "react";
import { RosterRow } from "../../../components/RosterRow";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDateTime } from "../../../utils/format";
import type { AuditListItem } from "../hooks/useAuditsSlice";

export interface AuditRailProps {
  items: readonly AuditListItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  testId?: string;
}

function AuditRailImpl({
  items,
  selectedSlug,
  onSelect,
  testId = "audits-rail",
}: AuditRailProps) {
  const onListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (items.length === 0) return;
      const idx = items.findIndex((i) => i.slug === selectedSlug);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = items[Math.min(items.length - 1, Math.max(0, idx) + 1)];
        if (next) onSelect(next.slug);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = items[Math.max(0, (idx < 0 ? 0 : idx) - 1)];
        if (prev) onSelect(prev.slug);
      }
    },
    [items, onSelect, selectedSlug],
  );

  return (
    <div className="hf-browser-rail" data-testid={testId}>
      <h2 className="hf-browser-rail__title">Audits</h2>
      <div
        className="hf-browser-rail__list"
        role="listbox"
        aria-label="Audits"
        data-testid={`${testId}-list`}
        onKeyDown={onListKeyDown}
      >
        {items.map((item) => {
          const meta =
            item.mtimeMs !== undefined
              ? formatDateTime(item.mtimeMs)
              : undefined;
          return (
            <div key={item.slug} className="hf-roster__row-wrap">
              <RosterRow
                title={item.title}
                {...(meta !== undefined ? { meta } : {})}
                selected={item.slug === selectedSlug}
                onSelect={() => onSelect(item.slug)}
                testId={`${testId}-row-${item.slug}`}
              />
              {item.verdict ? (
                <StatusBadge
                  verdict={item.verdict}
                  testId={`${testId}-verdict-${item.slug}`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const AuditRail = memo(AuditRailImpl);

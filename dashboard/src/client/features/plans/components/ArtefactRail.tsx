import { memo, useCallback, type KeyboardEvent } from "react";
import { RosterRow } from "../../../components/RosterRow";
import { formatDateTime } from "../../../utils/format";
import type { PlanListItem } from "../hooks/usePlansSlice";

export interface ArtefactRailProps {
  items: readonly PlanListItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  title?: string;
  testId?: string;
}

function ArtefactRailImpl({
  items,
  selectedSlug,
  onSelect,
  title = "Plans",
  testId = "plans-rail",
}: ArtefactRailProps) {
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
      <h2 className="hf-browser-rail__title" data-testid={`${testId}-title`}>
        {title}
      </h2>
      <div
        className="hf-browser-rail__list"
        role="listbox"
        aria-label={title}
        data-testid={`${testId}-list`}
        onKeyDown={onListKeyDown}
      >
        {items.map((item) => {
          const meta =
            item.mtimeMs !== undefined
              ? formatDateTime(item.mtimeMs)
              : item.parseError
                ? "degraded"
                : undefined;
          return (
            <RosterRow
              key={item.slug}
              title={item.title}
              {...(meta !== undefined ? { meta } : {})}
              selected={item.slug === selectedSlug}
              onSelect={() => onSelect(item.slug)}
              testId={`${testId}-row-${item.slug}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export const ArtefactRail = memo(ArtefactRailImpl);

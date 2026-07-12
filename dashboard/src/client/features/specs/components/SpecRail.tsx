import { memo, useCallback, type KeyboardEvent } from "react";
import { RosterRow } from "../../../components/RosterRow";
import { formatDateTime } from "../../../utils/format";
import type { SpecListItem } from "../hooks/useSpecsSlice";

export interface SpecRailProps {
  items: readonly SpecListItem[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  testId?: string;
}

function SpecRailImpl({
  items,
  selectedSlug,
  onSelect,
  testId = "specs-rail",
}: SpecRailProps) {
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
      <h2 className="hf-browser-rail__title">Specs</h2>
      <div
        className="hf-browser-rail__list"
        role="listbox"
        aria-label="Specs"
        data-testid={`${testId}-list`}
        onKeyDown={onListKeyDown}
      >
        {items.map((item) => {
          const meta =
            item.mtimeMs !== undefined
              ? formatDateTime(item.mtimeMs)
              : item.parseError
                ? "degraded"
                : item.draft
                  ? "draft"
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

export const SpecRail = memo(SpecRailImpl);

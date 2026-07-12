import { memo, type KeyboardEvent } from "react";

export interface RosterRowProps {
  title: string;
  meta?: string;
  dense?: boolean;
  selected?: boolean;
  checked?: boolean;
  showCheckbox?: boolean;
  onSelect?: () => void;
  onCheckedChange?: (checked: boolean) => void;
  testId?: string;
}

function RosterRowImpl({
  title,
  meta,
  dense = false,
  selected = false,
  checked = false,
  showCheckbox = false,
  onSelect,
  onCheckedChange,
  testId = "roster-row",
}: RosterRowProps) {
  const className = [
    "hf-roster-row",
    dense ? "hf-roster-row--dense" : "",
    selected ? "hf-roster-row--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.();
    }
  };

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={className}
      data-testid={testId}
      data-dense={dense ? "true" : "false"}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      {showCheckbox ? (
        <input
          type="checkbox"
          className="hf-roster-row__check"
          checked={checked}
          data-testid={`${testId}-checkbox`}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label={title}
        />
      ) : (
        <span aria-hidden />
      )}
      <span className="hf-roster-row__title">{title}</span>
      {meta !== undefined ? (
        <span className="hf-roster-row__meta">{meta}</span>
      ) : (
        <span />
      )}
    </div>
  );
}

export const RosterRow = memo(RosterRowImpl);

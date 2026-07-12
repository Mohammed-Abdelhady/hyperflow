import { memo } from "react";
import { RosterRow } from "../../../components/RosterRow";

export type ManagementSection = "config" | "markers" | "handoff" | "restore";

export const MANAGEMENT_SECTIONS: readonly {
  id: ManagementSection;
  label: string;
}[] = [
  { id: "config", label: "Config" },
  { id: "markers", label: "Markers" },
  { id: "handoff", label: "Handoff" },
  { id: "restore", label: "Restore" },
] as const;

export interface SectionRailProps {
  selected: ManagementSection;
  onSelect: (section: ManagementSection) => void;
  testId?: string;
}

function SectionRailImpl({
  selected,
  onSelect,
  testId = "mgmt-rail",
}: SectionRailProps) {
  return (
    <div className="hf-browser-rail" data-testid={testId}>
      <h2 className="hf-browser-rail__title">Manage</h2>
      <div
        className="hf-browser-rail__list"
        role="listbox"
        aria-label="Management sections"
        data-testid={`${testId}-list`}
      >
        {MANAGEMENT_SECTIONS.map((s) => (
          <RosterRow
            key={s.id}
            title={s.label}
            selected={selected === s.id}
            onSelect={() => onSelect(s.id)}
            testId={`${testId}-row-${s.id}`}
          />
        ))}
      </div>
    </div>
  );
}

export const SectionRail = memo(SectionRailImpl);

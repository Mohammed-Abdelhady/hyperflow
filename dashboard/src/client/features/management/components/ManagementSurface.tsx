import { useMemo } from "react";
import { BrowserSplit } from "../../plans/components/BrowserSplit";
import { usePlanSelection } from "../../plans/hooks/usePlanSelection";
import { ConfigEditor } from "../config/ConfigEditor";
import { HandoffPanel } from "../handoff/HandoffPanel";
import { useObserveMode } from "../hooks/useObserveMode";
import { MarkerPanel } from "../markers/MarkerPanel";
import { RestorePanel } from "../restore/RestorePanel";
import {
  MANAGEMENT_SECTIONS,
  SectionRail,
  type ManagementSection,
} from "./SectionRail";

const SECTION_IDS = MANAGEMENT_SECTIONS.map((s) => s.id);

function isSection(slug: string | null): slug is ManagementSection {
  return (
    slug === "config" ||
    slug === "markers" ||
    slug === "handoff" ||
    slug === "restore"
  );
}

export function ManagementSurface() {
  const { observeMode } = useObserveMode();
  const slugs = useMemo(() => [...SECTION_IDS], []);
  const { selectedSlug, select } = usePlanSelection({ slugs });
  const section: ManagementSection = isSection(selectedSlug)
    ? selectedSlug
    : "config";

  return (
    <div data-testid="surface-config" style={{ height: "100%" }}>
      <BrowserSplit
        testId="mgmt-split"
        rail={
          <SectionRail
            selected={section}
            onSelect={(s) => select(s)}
          />
        }
        pane={
          <>
            {section === "config" ? (
              <ConfigEditor observeMode={observeMode} />
            ) : null}
            {section === "markers" ? <MarkerPanel /> : null}
            {section === "handoff" ? <HandoffPanel /> : null}
            {section === "restore" ? <RestorePanel /> : null}
          </>
        }
      />
    </div>
  );
}

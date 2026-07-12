import { useMemo } from "react";
import { EmptyState } from "../../../components/EmptyState";
import { ArtefactRail } from "./ArtefactRail";
import { BrowserSplit } from "./BrowserSplit";
import { ConclusionsPanel } from "./ConclusionsPanel";
import { PlanDocument } from "./PlanDocument";
import { usePlanSelection } from "../hooks/usePlanSelection";
import { usePlansSlice } from "../hooks/usePlansSlice";

export function PlansSurface() {
  const { plans, taskBySlug, conclusions, empty } = usePlansSlice();
  const slugs = useMemo(() => plans.map((p) => p.slug), [plans]);
  const { selectedSlug, select } = usePlanSelection({ slugs });
  const selected = selectedSlug
    ? (taskBySlug.get(selectedSlug) ?? null)
    : null;

  if (empty) {
    return (
      <div data-testid="surface-plans">
        <EmptyState
          fact="No plans in this .hyperflow tree. Run /hyperflow:plan to create task decompositions."
          testId="plans-empty"
        />
      </div>
    );
  }

  return (
    <div data-testid="surface-plans" style={{ height: "100%" }}>
      <BrowserSplit
        testId="plans-split"
        rail={
          <ArtefactRail
            items={plans}
            selectedSlug={selectedSlug}
            onSelect={select}
          />
        }
        pane={
          <>
            <PlanDocument entry={selected} />
            <ConclusionsPanel
              conclusions={conclusions}
              focusSlug={selectedSlug}
            />
          </>
        }
      />
    </div>
  );
}

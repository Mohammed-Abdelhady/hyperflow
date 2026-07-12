import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { FeatureNode } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { ArtefactRail } from "../../plans/components/ArtefactRail";
import { BrowserSplit } from "../../plans/components/BrowserSplit";
import type { PlanListItem } from "../../plans/hooks/usePlansSlice";
import { useDrillState } from "../hooks/useDrillState";
import { useFeaturesSlice } from "../hooks/useFeaturesSlice";
import { findPhase, findTask } from "../utils/feature-tree";
import { DrillBreadcrumbs } from "./DrillBreadcrumbs";
import { FeatureOverview } from "./FeatureOverview";
import { PhaseView } from "./PhaseView";
import { TaskBriefView } from "./TaskBriefView";

export function FeaturesSurface() {
  const { items, bySlug, empty } = useFeaturesSlice();
  const {
    position,
    selectFeature,
    selectPhase,
    selectTask,
    goFeature,
    goPhase,
  } = useDrillState();

  const railItems: PlanListItem[] = useMemo(
    () =>
      items.map((i) => ({
        slug: i.slug,
        path: i.path,
        title: i.title,
        ...(i.mtimeMs !== undefined ? { mtimeMs: i.mtimeMs } : {}),
        parseError: i.parseError,
        derived: false,
        progressDone: 0,
        progressTotal: i.phaseCount,
      })),
    [items],
  );

  const selectedFeature = position.feature
    ? (bySlug.get(position.feature) ?? null)
    : null;

  const featureNode =
    selectedFeature && !isRawEntry(selectedFeature)
      ? (selectedFeature as FeatureNode)
      : null;

  const phaseEntry =
    featureNode && position.phase
      ? findPhase(featureNode, position.phase)
      : null;

  const taskEntry =
    phaseEntry && !isRawEntry(phaseEntry) && position.task
      ? findTask(phaseEntry, position.task)
      : null;

  if (empty) {
    return (
      <div data-testid="surface-features">
        <EmptyState
          fact="No multi-phase features in this tree. Scaffold under .hyperflow/features/."
          testId="features-empty"
        />
      </div>
    );
  }

  let pane = (
    <FeatureOverview
      entry={selectedFeature}
      onSelectPhase={selectPhase}
    />
  );
  if (position.phase) {
    pane = (
      <PhaseView phase={phaseEntry} onSelectTask={selectTask} />
    );
  }
  if (position.task) {
    pane = <TaskBriefView entry={taskEntry} />;
  }

  return (
    <div data-testid="surface-features" style={{ height: "100%" }}>
      <BrowserSplit
        testId="features-split"
        rail={
          <ArtefactRail
            items={railItems}
            selectedSlug={position.feature}
            onSelect={selectFeature}
            title="Features"
            testId="features-rail"
          />
        }
        header={
          <DrillBreadcrumbs
            feature={position.feature}
            phase={position.phase}
            task={position.task}
            onFeature={goFeature}
            onPhase={goPhase}
          />
        }
        pane={pane}
      />
    </div>
  );
}

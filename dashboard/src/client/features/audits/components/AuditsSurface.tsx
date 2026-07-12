import { useMemo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import { EmptyState } from "../../../components/EmptyState";
import { BrowserSplit } from "../../plans/components/BrowserSplit";
import { usePlanSelection } from "../../plans/hooks/usePlanSelection";
import { useAuditsSlice } from "../hooks/useAuditsSlice";
import { useHeatmapModel } from "../hooks/useHeatmapModel";
import { AuditRail } from "./AuditRail";
import { FindingsList } from "./FindingsList";
import { TrendHeatmap } from "./TrendHeatmap";

export function AuditsSurface() {
  const {
    items,
    bySlug,
    audits,
    empty,
    severityFilter,
    setSeverityFilter,
    findingsFor,
  } = useAuditsSlice();
  const slugs = useMemo(() => items.map((i) => i.slug), [items]);
  const { selectedSlug, select } = usePlanSelection({ slugs });
  const selected = selectedSlug ? (bySlug.get(selectedSlug) ?? null) : null;
  const heatmap = useHeatmapModel(audits);
  const { findings, rollup } = findingsFor(selected);

  if (empty) {
    return (
      <div data-testid="surface-audits">
        <EmptyState
          fact="No audits recorded. Run an audit chain to populate .hyperflow/audits/."
          testId="audits-empty"
        />
      </div>
    );
  }

  return (
    <div data-testid="surface-audits" style={{ height: "100%" }}>
      <BrowserSplit
        testId="audits-split"
        rail={
          <AuditRail
            items={items}
            selectedSlug={selectedSlug}
            onSelect={select}
          />
        }
        pane={
          <>
            <TrendHeatmap model={heatmap} onSelectAudit={select} />
            {selected && isRawEntry(selected) ? (
              <article className="hf-doc" data-testid="audit-document">
                <span className="hf-doc__badge" data-testid="audit-degraded">
                  Degraded — parse error
                </span>
                <pre className="hf-doc__raw" data-testid="audit-raw">
                  {selected.raw}
                </pre>
              </article>
            ) : (
              <FindingsList
                findings={findings}
                rollup={rollup}
                severityFilter={severityFilter}
                onSeverityFilter={setSeverityFilter}
              />
            )}
          </>
        }
      />
    </div>
  );
}

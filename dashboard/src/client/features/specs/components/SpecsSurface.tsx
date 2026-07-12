import { useMemo, useState } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { SpecNode } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { BrowserSplit } from "../../plans/components/BrowserSplit";
import { usePlanSelection } from "../../plans/hooks/usePlanSelection";
import { useSpecDiff } from "../hooks/useSpecDiff";
import {
  revisionsForSlug,
  useSpecsSlice,
} from "../hooks/useSpecsSlice";
import { SectionDiff } from "./SectionDiff";
import { SpecDocument } from "./SpecDocument";
import { SpecRail } from "./SpecRail";

export function SpecsSurface() {
  const { items, bySlug, revisionGroups, empty } = useSpecsSlice();
  const slugs = useMemo(() => items.map((i) => i.slug), [items]);
  const { selectedSlug, select } = usePlanSelection({ slugs });
  const selected = selectedSlug ? (bySlug.get(selectedSlug) ?? null) : null;
  const [diffMode, setDiffMode] = useState(false);

  const revisions = useMemo(
    () => (selectedSlug ? revisionsForSlug(revisionGroups, selectedSlug) : []),
    [revisionGroups, selectedSlug],
  );

  const left = revisions[0] ?? null;
  const right =
    revisions.length >= 2
      ? (revisions[revisions.length - 1] ?? null)
      : !isRawEntry(selected)
        ? (selected as SpecNode | null)
        : null;

  const compareLeft = revisions.length >= 2 ? left : right;
  const compareRight = revisions.length >= 2 ? right : null;
  const diffModel = useSpecDiff(compareLeft, compareRight);

  if (empty) {
    return (
      <div data-testid="surface-specs">
        <EmptyState
          fact="No specs in this .hyperflow tree. Add design contracts under .hyperflow/specs/."
          testId="specs-empty"
        />
      </div>
    );
  }

  return (
    <div data-testid="surface-specs" style={{ height: "100%" }}>
      <BrowserSplit
        testId="specs-split"
        rail={
          <SpecRail
            items={items}
            selectedSlug={selectedSlug}
            onSelect={select}
          />
        }
        header={
          <div className="hf-diff__controls">
            <button
              type="button"
              className="hf-btn"
              data-testid="specs-diff-toggle"
              disabled={!diffModel.canCompare}
              onClick={() => setDiffMode((v) => !v)}
              title={
                diffModel.canCompare
                  ? "Toggle section diff"
                  : "one revision — nothing to diff yet"
              }
            >
              {diffModel.canCompare
                ? diffMode
                  ? "Hide diff"
                  : "Compare revisions"
                : "one revision — nothing to diff yet"}
            </button>
          </div>
        }
        pane={
          <>
            {diffMode && diffModel.canCompare ? (
              <SectionDiff model={diffModel} />
            ) : (
              <SpecDocument entry={selected} />
            )}
          </>
        }
      />
    </div>
  );
}

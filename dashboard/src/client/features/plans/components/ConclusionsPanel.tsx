import { memo } from "react";
import type {
  ConclusionsResult,
  PlanConclusion,
} from "@shared/derived/index.js";
import { StatusBadge } from "../../../components/StatusBadge";
import {
  citationToAnchor,
  scrollToCitation,
} from "../utils/conclusion-citations";

export interface ConclusionsPanelProps {
  conclusions: ConclusionsResult | null;
  /** When set, show only this plan's conclusion; else all pending-first. */
  focusSlug?: string | null;
  testId?: string;
}

function statusVerdict(status: PlanConclusion["status"]): string {
  if (status === "completed") return "PASS";
  if (status === "running") return "LIVE";
  if (status === "pending") return "QUEUED";
  return "BLOCKED";
}

function ConclusionsPanelImpl({
  conclusions,
  focusSlug,
  testId = "conclusions-panel",
}: ConclusionsPanelProps) {
  const plans = conclusions?.plans ?? [];
  const filtered = focusSlug
    ? plans.filter((p) => p.id === focusSlug || p.title === focusSlug)
    : plans;

  if (filtered.length === 0) {
    return (
      <section className="hf-conclusions" data-testid={testId}>
        <h3 className="hf-doc__section-title">Plan Conclusions</h3>
        <p className="hf-replay__note" data-testid={`${testId}-empty`}>
          No conclusions yet. Pending plans will list progress-so-far here.
        </p>
      </section>
    );
  }

  const pendingOnly =
    filtered.length > 0 && filtered.every((p) => p.status === "pending");

  return (
    <section className="hf-conclusions" data-testid={testId}>
      <h3 className="hf-doc__section-title">Plan Conclusions</h3>
      {pendingOnly ? (
        <p className="hf-replay__note" data-testid={`${testId}-pending-note`}>
          All listed plans are still pending — progress so far:
        </p>
      ) : null}
      <ul className="hf-conclusions__list" data-testid={`${testId}-list`}>
        {filtered.map((plan) => (
          <li
            key={plan.id}
            className="hf-conclusions__item"
            data-testid={`${testId}-item-${plan.id}`}
          >
            <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
              <strong data-testid={`${testId}-title-${plan.id}`}>
                {plan.title}
              </strong>
              <StatusBadge
                verdict={statusVerdict(plan.status)}
                testId={`${testId}-status-${plan.id}`}
              />
              <span className="hf-roster-row__meta">{plan.progressSoFar}</span>
            </div>
            {plan.claims.map((claim, ci) => (
              <div key={`${plan.id}-${ci}`}>
                <p className="hf-conclusions__claim">{claim.text}</p>
                <div className="hf-conclusions__cites">
                  {claim.citations.map((c, i) => {
                    const anchor = citationToAnchor(c);
                    return (
                      <button
                        key={`${anchor.anchorId}-${i}`}
                        type="button"
                        className="hf-conclusions__cite"
                        data-testid={`${testId}-cite-${plan.id}-${ci}-${i}`}
                        onClick={() => scrollToCitation(anchor.anchorId)}
                      >
                        {anchor.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const ConclusionsPanel = memo(ConclusionsPanelImpl);

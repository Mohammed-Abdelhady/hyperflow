import { memo } from "react";

export interface DrillBreadcrumbsProps {
  feature: string | null;
  phase: string | null;
  task: string | null;
  onFeature: () => void;
  onPhase: () => void;
  testId?: string;
}

function DrillBreadcrumbsImpl({
  feature,
  phase,
  task,
  onFeature,
  onPhase,
  testId = "drill-breadcrumbs",
}: DrillBreadcrumbsProps) {
  if (!feature) return null;

  return (
    <nav className="hf-breadcrumb" data-testid={testId} aria-label="Drill path">
      <button
        type="button"
        className="hf-breadcrumb__btn"
        data-testid={`${testId}-feature`}
        onClick={onFeature}
      >
        {feature}
      </button>
      {phase ? (
        <>
          <span className="hf-breadcrumb__sep" aria-hidden>
            /
          </span>
          <button
            type="button"
            className="hf-breadcrumb__btn"
            data-testid={`${testId}-phase`}
            onClick={onPhase}
          >
            {phase}
          </button>
        </>
      ) : null}
      {task ? (
        <>
          <span className="hf-breadcrumb__sep" aria-hidden>
            /
          </span>
          <span data-testid={`${testId}-task`}>{task}</span>
        </>
      ) : null}
    </nav>
  );
}

export const DrillBreadcrumbs = memo(DrillBreadcrumbsImpl);

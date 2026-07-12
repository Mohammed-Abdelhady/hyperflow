import { memo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  FeatureEntry,
  FeatureNode,
  FeaturePhase,
} from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { RosterRow } from "../../../components/RosterRow";
import { StatusBadge } from "../../../components/StatusBadge";
import { orderPhases, progressPercent } from "../utils/feature-tree";

export interface FeatureOverviewProps {
  entry: FeatureEntry | null;
  onSelectPhase: (phaseKey: string) => void;
  testId?: string;
}

function FeatureOverviewImpl({
  entry,
  onSelectPhase,
  testId = "feature-overview",
}: FeatureOverviewProps) {
  if (!entry) {
    return (
      <EmptyState
        fact="Select a feature from the rail to inspect its phases."
        testId={`${testId}-empty`}
      />
    );
  }

  if (isRawEntry(entry)) {
    return (
      <article className="hf-doc" data-testid={testId}>
        <span className="hf-doc__badge" data-testid={`${testId}-degraded`}>
          Degraded — parse error
        </span>
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {entry.raw}
        </pre>
      </article>
    );
  }

  const feature = entry as FeatureNode;
  const phases = orderPhases(feature.phases);

  return (
    <article className="hf-doc" data-testid={testId}>
      <h2 className="hf-doc__title" data-testid={`${testId}-title`}>
        {feature.name || feature.slug}
      </h2>
      {feature.status ? (
        <StatusBadge verdict={feature.status} testId={`${testId}-status`} />
      ) : null}
      {feature.statusFields ? (
        <table className="hf-doc__status-table" data-testid={`${testId}-status-table`}>
          <tbody>
            {Object.entries(feature.statusFields).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {feature.goal ? (
        <p className="hf-doc__tldr" data-testid={`${testId}-goal`}>
          {feature.goal}
        </p>
      ) : null}
      <h3 className="hf-doc__section-title">Phases</h3>
      {phases.length === 0 ? (
        <EmptyState
          fact="This feature has zero phases. Add phase-<n>-* folders under the feature."
          testId={`${testId}-no-phases`}
        />
      ) : (
        <div className="hf-roster" data-testid={`${testId}-phases`}>
          {phases.map((p, i) => {
            if (isRawEntry(p)) {
              return (
                <RosterRow
                  key={p.path}
                  title={p.path}
                  meta="degraded"
                  onSelect={() => onSelectPhase(p.path)}
                  testId={`${testId}-phase-raw-${i}`}
                />
              );
            }
            const phase = p as FeaturePhase;
            const pct = progressPercent(phase.progress);
            return (
              <div key={phase.folder} data-testid={`${testId}-phase-${phase.folder}`}>
                <RosterRow
                  title={phase.name || phase.folder}
                  meta={`${pct}%`}
                  onSelect={() => onSelectPhase(phase.folder)}
                  testId={`${testId}-phase-row-${phase.folder}`}
                />
                <div className="hf-doc__progress" aria-hidden>
                  <div
                    className="hf-doc__progress-fill"
                    style={{ width: `${pct}%` }}
                    data-testid={`${testId}-progress-${phase.folder}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

export const FeatureOverview = memo(FeatureOverviewImpl);

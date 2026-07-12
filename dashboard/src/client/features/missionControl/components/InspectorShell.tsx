import { memo, type ReactNode } from "react";
import type { RosterAgent } from "../hooks/use-mission-roster";

export interface InspectorShellProps {
  agent: RosterAgent | null;
  /** Extra detail panels (T26b). */
  detail?: ReactNode;
  testId?: string;
}

function InspectorShellImpl({
  agent,
  detail,
  testId = "mission-inspector",
}: InspectorShellProps) {
  return (
    <aside className="hf-cockpit__inspector" data-testid={testId}>
      <div className="hf-cockpit__inspector-inner">
        <h2
          className="hf-cockpit__inspector-title"
          data-testid={`${testId}-title`}
        >
          {agent ? agent.title : "Inspector"}
        </h2>
        <div
          className="hf-cockpit__inspector-body"
          data-testid={`${testId}-body`}
        >
          {agent ? (
            <>
              <div data-testid={`${testId}-stage`}>
                Stage: {agent.stageLabel}
              </div>
              <div data-testid={`${testId}-cost`}>Cost: {agent.costLabel}</div>
              {agent.purpose ? (
                <div data-testid={`${testId}-purpose`}>{agent.purpose}</div>
              ) : null}
              {detail}
            </>
          ) : (
            <p data-testid={`${testId}-empty`}>
              Select an agent on the board to inspect stage, task, and cost.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

export const InspectorShell = memo(InspectorShellImpl);

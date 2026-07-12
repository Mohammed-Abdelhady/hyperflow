import { memo } from "react";
import type { TaskEntry } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { PlanDocument } from "../../plans/components/PlanDocument";

export interface TaskBriefViewProps {
  entry: TaskEntry | null;
  testId?: string;
}

/**
 * Reuses T29 PlanDocument for parsed task-brief rendering —
 * features tree tasks are plan-shaped, not a separate format.
 */
function TaskBriefViewImpl({
  entry,
  testId = "task-brief",
}: TaskBriefViewProps) {
  if (!entry) {
    return (
      <EmptyState
        fact="Task brief not found in this phase."
        testId={`${testId}-missing`}
      />
    );
  }
  return <PlanDocument entry={entry} testId={testId} />;
}

export const TaskBriefView = memo(TaskBriefViewImpl);

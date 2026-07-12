import { memo } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type {
  FeaturePhase,
  FeaturePhaseEntry,
  TaskEntry,
  TaskNode,
} from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { RosterRow } from "../../../components/RosterRow";
import { StatusBadge } from "../../../components/StatusBadge";
import { formatDeps, taskSlug, taskTitle } from "../utils/feature-tree";

export interface PhaseViewProps {
  phase: FeaturePhaseEntry | null;
  onSelectTask: (taskSlug: string) => void;
  testId?: string;
}

function PhaseViewImpl({
  phase,
  onSelectTask,
  testId = "phase-view",
}: PhaseViewProps) {
  if (!phase) {
    return (
      <EmptyState
        fact="Phase not found in this feature tree."
        testId={`${testId}-missing`}
      />
    );
  }

  if (isRawEntry(phase)) {
    return (
      <article className="hf-doc" data-testid={testId}>
        <span className="hf-doc__badge" data-testid={`${testId}-degraded`}>
          Degraded — parse error
        </span>
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {phase.raw}
        </pre>
      </article>
    );
  }

  const node = phase as FeaturePhase;

  return (
    <article className="hf-doc" data-testid={testId}>
      <h2 className="hf-doc__title" data-testid={`${testId}-title`}>
        {node.name || node.folder}
      </h2>
      {node.status ? (
        <StatusBadge verdict={node.status} testId={`${testId}-status`} />
      ) : null}
      {node.statusFields ? (
        <table className="hf-doc__status-table" data-testid={`${testId}-status-table`}>
          <tbody>
            {Object.entries(node.statusFields).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <h3 className="hf-doc__section-title">Exit criteria</h3>
      <div className="hf-roster" data-testid={`${testId}-exit-criteria`}>
        {node.exitCriteria.length === 0 ? (
          <p className="hf-replay__note">No exit criteria listed.</p>
        ) : (
          node.exitCriteria.map((c, i) => (
            <RosterRow
              key={`${c.label}-${i}`}
              title={c.label}
              meta={c.state}
              showCheckbox
              checked={c.state === "done"}
              testId={`${testId}-exit-${i}`}
            />
          ))
        )}
      </div>
      <h3 className="hf-doc__section-title">Tasks</h3>
      {node.tasks.length === 0 ? (
        <EmptyState
          fact="This phase has an empty tasks/ folder."
          testId={`${testId}-no-tasks`}
        />
      ) : (
        <div className="hf-roster" data-testid={`${testId}-tasks`}>
          {node.tasks.map((t: TaskEntry, i: number) => {
            const slug = taskSlug(t);
            if (isRawEntry(t)) {
              return (
                <RosterRow
                  key={t.path}
                  title={t.path}
                  meta="degraded"
                  onSelect={() => onSelectTask(slug)}
                  testId={`${testId}-task-raw-${i}`}
                />
              );
            }
            const task = t as TaskNode;
            const meta = [
              task.subTasks[0]?.detail?.complexity,
              task.subTasks[0]?.detail?.specialist,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <div key={slug} className="hf-roster__row-wrap">
                <RosterRow
                  title={taskTitle(t)}
                  {...(meta ? { meta } : {})}
                  onSelect={() => onSelectTask(slug)}
                  testId={`${testId}-task-${slug}`}
                />
                {task.status ? (
                  <StatusBadge
                    verdict={task.status}
                    testId={`${testId}-task-status-${slug}`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {node.dependsOn.length > 0 ? (
        <p className="hf-replay__note" data-testid={`${testId}-deps`}>
          Depends on: {formatDeps(node.dependsOn)}
        </p>
      ) : null}
    </article>
  );
}

export const PhaseView = memo(PhaseViewImpl);

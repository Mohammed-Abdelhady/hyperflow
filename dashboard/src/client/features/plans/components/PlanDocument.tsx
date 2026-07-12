import { lazy, memo, Suspense } from "react";
import { isRawEntry } from "@shared/derived/parse-nodes.js";
import type { TaskEntry, TaskNode } from "@shared/schemas/index.js";
import { EmptyState } from "../../../components/EmptyState";
import { RosterRow } from "../../../components/RosterRow";
import { StatusBadge } from "../../../components/StatusBadge";
import { HUGE_ARTEFACT_CHARS } from "../../../constants/motion";
import { lineAnchorId } from "../utils/conclusion-citations";

const MermaidBlock = lazy(async () => {
  const mod = await import("../../../mermaid/MermaidBlock");
  return { default: mod.MermaidBlock };
});

export interface PlanDocumentProps {
  entry: TaskEntry | null;
  testId?: string;
}

function checkboxChecked(state: string): boolean {
  return state === "done";
}

function PlanDocumentImpl({
  entry,
  testId = "plan-document",
}: PlanDocumentProps) {
  if (!entry) {
    return (
      <EmptyState
        fact="Select a plan from the rail to inspect its roster and conclusions."
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
        <h2 className="hf-doc__title">{entry.path}</h2>
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {entry.raw}
        </pre>
      </article>
    );
  }

  const plan = entry as TaskNode;
  const rawLen = plan.raw?.length ?? 0;
  const huge = rawLen > HUGE_ARTEFACT_CHARS;

  if (huge && plan.raw) {
    return (
      <article className="hf-doc" data-testid={testId}>
        <span className="hf-doc__badge" data-testid={`${testId}-huge`}>
          Huge artefact — raw view
        </span>
        <h2 className="hf-doc__title">{plan.slug}</h2>
        <pre className="hf-doc__raw" data-testid={`${testId}-raw`}>
          {plan.raw}
        </pre>
      </article>
    );
  }

  return (
    <article className="hf-doc" data-testid={testId}>
      {plan.parseHealth.state === "derived" ? (
        <span className="hf-doc__badge" data-testid={`${testId}-derived`}>
          Derived parse health
        </span>
      ) : null}
      {plan.parseHealth.state === "degraded" ? (
        <span className="hf-doc__badge" data-testid={`${testId}-degraded`}>
          Degraded
        </span>
      ) : null}
      <h2 className="hf-doc__title" data-testid={`${testId}-title`}>
        {plan.slug}
      </h2>
      {plan.status ? (
        <StatusBadge verdict={plan.status} testId={`${testId}-status`} />
      ) : null}
      {plan.statusFields ? (
        <table className="hf-doc__status-table" data-testid={`${testId}-status-table`}>
          <tbody>
            {Object.entries(plan.statusFields).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {plan.objective ? (
        <p
          className="hf-doc__tldr"
          id={lineAnchorId(plan.path, 1)}
          data-testid={`${testId}-objective`}
        >
          {plan.objective}
        </p>
      ) : null}
      <h3 className="hf-doc__section-title">Roster</h3>
      <div className="hf-roster" data-testid={`${testId}-roster`} role="list">
        {plan.subTasks.map((st, i) => (
          <div
            key={`${st.title}-${i}`}
            id={lineAnchorId(plan.path, i + 2)}
            data-testid={`${testId}-subtask-${i}`}
          >
            <RosterRow
              title={st.title}
              meta={st.state}
              showCheckbox
              checked={checkboxChecked(st.state)}
              testId={`${testId}-row-${i}`}
            />
          </div>
        ))}
      </div>
      {plan.executionPlanRaw?.includes("```mermaid") ? (
        <Suspense
          fallback={
            <div data-testid={`${testId}-mermaid-loading`}>Loading diagram…</div>
          }
        >
          <MermaidBlock
            source={extractMermaid(plan.executionPlanRaw)}
            testId={`${testId}-mermaid`}
          />
        </Suspense>
      ) : null}
    </article>
  );
}

function extractMermaid(raw: string): string {
  const m = raw.match(/```mermaid\s*([\s\S]*?)```/i);
  return m?.[1]?.trim() ?? raw;
}

export const PlanDocument = memo(PlanDocumentImpl);

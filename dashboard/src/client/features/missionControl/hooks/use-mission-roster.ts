import { useMemo } from "react";
import type {
  BackgroundAgent,
  BackgroundRegistry,
  Snapshot,
  TaskNode,
} from "@shared/schemas/index.js";
import type { SemanticState } from "../../../constants/state-tokens";
import { useSnapshotData } from "../../../hooks/use-slice";
import { formatTokens } from "../../../utils/format";
import { selectTokenAnalytics } from "../../../utils/selectors";

export interface RosterAgent {
  id: string;
  title: string;
  stageLabel: string;
  stageState: SemanticState;
  costLabel: string;
  purpose?: string;
}

function isRaw(entry: unknown): boolean {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "parseError" in entry &&
    (entry as { parseError?: boolean }).parseError === true
  );
}

function statusToState(statusClass: string | undefined): SemanticState {
  switch (statusClass) {
    case "in-flight":
      return "live";
    case "completed":
      return "pass";
    case "errored":
    case "cancelled":
      return "blocked";
    case "stalled":
      return "fix";
    default:
      return "queued";
  }
}

function agentsFromBackground(snapshot: Snapshot): RosterAgent[] {
  if (isRaw(snapshot.background)) return [];
  const reg = snapshot.background as BackgroundRegistry;
  if (!reg.present) return [];
  const out: RosterAgent[] = [];
  for (const entry of reg.agents) {
    if (isRaw(entry) || ("raw" in entry && entry.raw === true)) continue;
    const a = entry as BackgroundAgent;
    const agent: RosterAgent = {
      id: a.id,
      title: a.id,
      stageLabel: a.status,
      stageState: statusToState(a.statusClass),
      costLabel: "0 tok",
    };
    if (a.purpose !== undefined) agent.purpose = a.purpose;
    out.push(agent);
  }
  return out;
}

function agentsFromTasks(snapshot: Snapshot): RosterAgent[] {
  const out: RosterAgent[] = [];
  for (const task of snapshot.tasks) {
    if (isRaw(task)) continue;
    const t = task as TaskNode;
    for (const st of t.subTasks) {
      const id = st.taskId ?? `${t.slug}:${st.title}`;
      const state: SemanticState =
        st.state === "done"
          ? "pass"
          : st.state === "running"
            ? "live"
            : "queued";
      out.push({
        id,
        title: st.detail?.specialist ?? st.role ?? st.title,
        stageLabel: st.state,
        stageState: state,
        costLabel: "0 tok",
        purpose: st.title,
      });
    }
  }
  return out;
}

export function useMissionRoster(): {
  agents: RosterAgent[];
  empty: boolean;
  stages: { id: string; label: string; costLabel?: string }[];
  activeStageIndex: number;
} {
  const snapshot = useSnapshotData();
  return useMemo(() => {
    if (!snapshot) {
      return { agents: [], empty: true, stages: [], activeStageIndex: 0 };
    }
    const fromBg = agentsFromBackground(snapshot);
    const agents = fromBg.length > 0 ? fromBg : agentsFromTasks(snapshot);
    const tokens = selectTokenAnalytics(snapshot);
    const byAgent = new Map(
      (tokens?.byAgent ?? []).map((a) => [a.agent, a.tokens]),
    );
    const enriched = agents.map((a) => {
      const tok = byAgent.get(a.title) ?? byAgent.get(a.id) ?? 0;
      return { ...a, costLabel: formatTokens(tok) };
    });

    const stages =
      tokens && tokens.byChain.length > 0
        ? tokens.byChain.map((c) => ({
            id: c.chain,
            label: c.chain,
            costLabel: formatTokens(c.tokens),
          }))
        : agents.length > 0
          ? [
              { id: "plan", label: "plan" },
              { id: "dispatch", label: "dispatch" },
              { id: "review", label: "review" },
              { id: "integrate", label: "integrate" },
            ]
          : [];

    const liveIdx = enriched.findIndex((a) => a.stageState === "live");
    const activeStageIndex =
      liveIdx >= 0
        ? Math.min(stages.length - 1, 1)
        : enriched.every((a) => a.stageState === "pass")
          ? Math.max(0, stages.length - 1)
          : 0;

    return {
      agents: enriched,
      empty: enriched.length === 0,
      stages,
      activeStageIndex: stages.length === 0 ? 0 : activeStageIndex,
    };
  }, [snapshot]);
}

import { useMemo } from "react";
import { useEventsSlice, useSnapshotData } from "../../../hooks/use-slice";
import { formatTokens } from "../../../utils/format";
import { selectTokenAnalytics } from "../../../utils/selectors";
import type { RosterAgent } from "./use-mission-roster";

export interface InspectorDetail {
  agentId: string;
  recentEvents: number;
  costLabel: string;
  lastMessage: string | null;
}

/**
 * Memoized inspector detail — stable when unrelated slice fields change.
 */
export function useInspectorDetail(
  agent: RosterAgent | null,
): InspectorDetail | null {
  const snapshot = useSnapshotData();
  const eventCount = useEventsSlice((s) => s.items.length);
  const lastEvent = useEventsSlice((s) =>
    s.items.length > 0 ? s.items[s.items.length - 1]! : null,
  );

  return useMemo(() => {
    if (!agent) return null;
    const tokens = selectTokenAnalytics(snapshot);
    const agentTok =
      tokens?.byAgent.find(
        (a) => a.agent === agent.title || a.agent === agent.id,
      )?.tokens ?? 0;
    let lastMessage: string | null = null;
    if (lastEvent) {
      if (lastEvent.line.variant === "v1") {
        lastMessage = lastEvent.line.event.type;
      } else {
        lastMessage = lastEvent.line.type ?? null;
      }
    }
    return {
      agentId: agent.id,
      recentEvents: eventCount,
      costLabel: formatTokens(agentTok),
      lastMessage,
    };
  }, [agent, snapshot, eventCount, lastEvent]);
}

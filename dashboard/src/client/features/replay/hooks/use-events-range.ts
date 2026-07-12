import { useQuery } from "@tanstack/react-query";
import {
  EventsRangeResponseSchema,
  HYPERFLOW_TOKEN_HEADER,
  type EventsRangeResponse,
} from "@shared/schemas/index.js";
import { useEffect } from "react";
import { QUERY_KEYS } from "../../../constants/query-keys";
import { useEventsStore } from "../../../stores/events";
import { readSessionToken } from "../../../utils/handshake";

export interface EventsRangeParams {
  from?: string;
  to?: string;
  enabled?: boolean;
}

async function fetchEventsRange(
  from?: string,
  to?: string,
): Promise<EventsRangeResponse> {
  const token = readSessionToken();
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString();
  const headers = new Headers();
  if (token) headers.set(HYPERFLOW_TOKEN_HEADER, token);
  const res = await fetch(`/api/v1/events${q ? `?${q}` : ""}`, { headers });
  const json: unknown = await res.json();
  if (!res.ok) {
    throw new Error("events range fetch failed");
  }
  return EventsRangeResponseSchema.parse(json);
}

/**
 * On-demand range fetch for scrubbing outside in-store retention.
 * Merges results into the events store; never blanks the board on error.
 */
export function useEventsRange({
  from,
  to,
  enabled = false,
}: EventsRangeParams) {
  const query = useQuery({
    queryKey: QUERY_KEYS.EVENTS_RANGE(from, to),
    queryFn: () => fetchEventsRange(from, to),
    enabled: enabled && Boolean(from || to),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!query.data) return;
    const stored = query.data.events.map((line, i) => ({
      id: `range-${from ?? ""}-${to ?? ""}-${i}`,
      line,
    }));
    useEventsStore.getState().mergeRange(stored);
  }, [query.data, from, to]);

  return {
    isFetching: query.isFetching,
    isError: query.isError,
    /** True while fetch in flight — consumer shows last-good + stale affordance. */
    stale: query.isFetching || query.isError,
  };
}

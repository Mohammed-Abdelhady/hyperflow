/** TanStack Query key factory — UPPER_SNAKE_CASE root segments. */
export const QUERY_KEYS = {
  SNAPSHOT: ["snapshot"] as const,
  EVENTS: ["events"] as const,
  EVENTS_RANGE: (from?: string, to?: string) =>
    ["events", "range", from ?? "", to ?? ""] as const,
  MEMORY: ["memory"] as const,
  MEMORY_CATEGORY: (category: string) => ["memory", category] as const,
  CONFIG: ["config"] as const,
  MARKERS: ["markers"] as const,
  HANDOFF: ["handoff"] as const,
  INSTANCE: ["instance"] as const,
} as const;

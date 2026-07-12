/** In-store event feed retention (drop-oldest). Overflow via /api/v1/events. */
export const EVENT_FEED_RETENTION_CAP = 500 as const;

/** Search/filter input debounce delay. */
export const INPUT_DEBOUNCE_MS = 200 as const;

/** SSE heartbeat-gap dead-connection threshold. */
export const SSE_HEARTBEAT_STALE_MS = 45_000 as const;

/** Sleep/wake staleness — force resync when last event older than this. */
export const SSE_WAKE_STALE_MS = 30_000 as const;

/** Leader election lease / heartbeat interval. */
export const LEADER_HEARTBEAT_MS = 2_000 as const;
export const LEADER_LEASE_MS = 5_000 as const;

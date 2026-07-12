/** Session token storage key — tab-scoped, never localStorage. */
export const TOKEN_STORAGE_KEY = "hyperflow.dashboard.token" as const;

/** Fragment prefix for the CLI launch handshake: `#token=<value>`. */
export const TOKEN_FRAGMENT_PREFIX = "token=" as const;

/** BroadcastChannel name for multi-tab leader election + token handoff. */
export const LEADER_CHANNEL_NAME = "hyperflow.dashboard.leader" as const;

/** Canonical history-mode route paths (spec §3B decision 14). */
export const ROUTES = {
  MISSION: "/mission",
  REPLAY: "/replay",
  HEALTH: "/health",
  LEADERBOARD: "/leaderboard",
  PLANS: "/plans",
  FEATURES: "/features",
  AUDITS: "/audits",
  MEMORY: "/memory",
  SPECS: "/specs",
  TOKENS: "/tokens",
  CONFIG: "/config",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

export const DEFAULT_ROUTE = ROUTES.MISSION;

/** Artefact deep-link query key. */
export const SLUG_QUERY_KEY = "slug" as const;

export function buildRoutePath(
  route: RoutePath,
  query?: { slug?: string },
): string {
  if (!query?.slug) return route;
  const params = new URLSearchParams({ [SLUG_QUERY_KEY]: query.slug });
  return `${route}?${params.toString()}`;
}

export function isKnownRoute(path: string): path is RoutePath {
  return (Object.values(ROUTES) as string[]).includes(path);
}

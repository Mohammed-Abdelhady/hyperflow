import { ROUTES, type RoutePath } from "./routes";
import type { SidebarSection } from "../types/ui";

export type FeatureId =
  | "mission"
  | "replay"
  | "health"
  | "leaderboard"
  | "plans"
  | "features"
  | "audits"
  | "memory"
  | "specs"
  | "tokens"
  | "config";

export interface FeatureRegistryEntry {
  id: FeatureId;
  route: RoutePath;
  label: string;
  section: SidebarSection;
  /** Lazy route boundary for heavy engines (graph/mermaid/replay). */
  lazyChunk?: "graph" | "mermaid" | "replay";
}

/** Surface id → route → label → sidebar section. */
export const FEATURE_REGISTRY: readonly FeatureRegistryEntry[] = [
  { id: "mission", route: ROUTES.MISSION, label: "Mission", section: "observe" },
  {
    id: "replay",
    route: ROUTES.REPLAY,
    label: "Replay",
    section: "observe",
    lazyChunk: "replay",
  },
  { id: "health", route: ROUTES.HEALTH, label: "Health", section: "graphs" },
  {
    id: "leaderboard",
    route: ROUTES.LEADERBOARD,
    label: "Leaderboard",
    section: "graphs",
  },
  { id: "plans", route: ROUTES.PLANS, label: "Plans", section: "artefacts" },
  {
    id: "features",
    route: ROUTES.FEATURES,
    label: "Features",
    section: "artefacts",
  },
  { id: "audits", route: ROUTES.AUDITS, label: "Audits", section: "artefacts" },
  { id: "memory", route: ROUTES.MEMORY, label: "Memory", section: "artefacts" },
  { id: "specs", route: ROUTES.SPECS, label: "Specs", section: "artefacts" },
  { id: "tokens", route: ROUTES.TOKENS, label: "Tokens", section: "graphs" },
  { id: "config", route: ROUTES.CONFIG, label: "Config", section: "manage" },
] as const;

export const SIDEBAR_SECTIONS: readonly {
  id: SidebarSection;
  label: string;
}[] = [
  { id: "observe", label: "Observe" },
  { id: "artefacts", label: "Artefacts" },
  { id: "graphs", label: "Graphs" },
  { id: "manage", label: "Manage" },
] as const;

export function featureByRoute(
  route: string,
): FeatureRegistryEntry | undefined {
  return FEATURE_REGISTRY.find((f) => f.route === route);
}

export function featuresForSection(
  section: SidebarSection,
): FeatureRegistryEntry[] {
  return FEATURE_REGISTRY.filter((f) => f.section === section);
}

import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import {
  FEATURE_REGISTRY,
  type FeatureId,
} from "../constants/features";
import { DEFAULT_ROUTE, ROUTES } from "../constants/routes";
import { NotFoundPage, SurfacePlaceholder } from "./placeholders";
import { Shell } from "./shell";

const LazyReplay = lazy(async () => {
  const { ReplayPage } = await import("../features/replay");
  return { default: ReplayPage };
});

const LazyHealth = lazy(async () => {
  const { HealthPage } = await import("../features/health");
  return { default: HealthPage };
});

const LazyLeaderboard = lazy(async () => {
  const { LeaderboardPage } = await import("../features/leaderboard");
  return { default: LeaderboardPage };
});

const LazyTokens = lazy(async () => {
  const { TokensPage } = await import("../features/tokens");
  return { default: TokensPage };
});

const LazyMission = lazy(async () => {
  const { MissionControlPage } = await import("../features/missionControl");
  return { default: MissionControlPage };
});

const LazyPlans = lazy(async () => {
  const { PlansSurface } = await import("../features/plans");
  return { default: PlansSurface };
});

const LazySpecs = lazy(async () => {
  const { SpecsSurface } = await import("../features/specs");
  return { default: SpecsSurface };
});

const LazyAudits = lazy(async () => {
  const { AuditsSurface } = await import("../features/audits");
  return { default: AuditsSurface };
});

function RouteSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="hf-placeholder" data-testid="route-suspense">
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function PlaceholderRoute({
  id,
  label,
}: {
  id: FeatureId;
  label: string;
}) {
  return <SurfacePlaceholder id={id} label={label} />;
}

function elementForFeature(id: FeatureId, label: string) {
  switch (id) {
    case "replay":
      return (
        <RouteSuspense>
          <LazyReplay />
        </RouteSuspense>
      );
    case "health":
      return (
        <RouteSuspense>
          <LazyHealth />
        </RouteSuspense>
      );
    case "leaderboard":
      return (
        <RouteSuspense>
          <LazyLeaderboard />
        </RouteSuspense>
      );
    case "tokens":
      return (
        <RouteSuspense>
          <LazyTokens />
        </RouteSuspense>
      );
    case "mission":
      return (
        <RouteSuspense>
          <LazyMission />
        </RouteSuspense>
      );
    case "plans":
      return (
        <RouteSuspense>
          <LazyPlans />
        </RouteSuspense>
      );
    case "specs":
      return (
        <RouteSuspense>
          <LazySpecs />
        </RouteSuspense>
      );
    case "audits":
      return (
        <RouteSuspense>
          <LazyAudits />
        </RouteSuspense>
      );
    default:
      return <PlaceholderRoute id={id} label={label} />;
  }
}

function buildFeatureRoutes() {
  return FEATURE_REGISTRY.map((feature) => ({
    path: feature.route.replace(/^\//, ""),
    element: elementForFeature(feature.id, feature.label),
  }));
}

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to={DEFAULT_ROUTE} replace /> },
      ...buildFeatureRoutes(),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={appRouter} />;
}

/** Typed helpers so features never hardcode path strings. */
export const routePaths = ROUTES;

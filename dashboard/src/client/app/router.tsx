import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { FEATURE_REGISTRY } from "../constants/features";
import { DEFAULT_ROUTE, ROUTES } from "../constants/routes";
import { NotFoundPage, SurfacePlaceholder } from "./placeholders";
import { Shell } from "./shell";

/** Lazy boundaries reserved for heavy chunks (graph / mermaid / replay). */
const LazyReplay = lazy(async () => {
  const { SurfacePlaceholder: P } = await import("./placeholders");
  return {
    default: function ReplaySurface() {
      return <P id="replay" label="Replay" />;
    },
  };
});

function PlaceholderRoute({
  id,
  label,
}: {
  id: (typeof FEATURE_REGISTRY)[number]["id"];
  label: string;
}) {
  return <SurfacePlaceholder id={id} label={label} />;
}

function buildFeatureRoutes() {
  return FEATURE_REGISTRY.map((feature) => {
    if (feature.lazyChunk === "replay") {
      return {
        path: feature.route.replace(/^\//, ""),
        element: (
          <Suspense
            fallback={
              <div className="hf-placeholder" data-testid="route-suspense">
                Loading…
              </div>
            }
          >
            <LazyReplay />
          </Suspense>
        ),
      };
    }
    return {
      path: feature.route.replace(/^\//, ""),
      element: <PlaceholderRoute id={feature.id} label={feature.label} />,
    };
  });
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

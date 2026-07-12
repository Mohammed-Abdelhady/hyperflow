import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./app/router";
import { UnauthenticatedExplainer } from "./app/unauthenticated";
import { browserHandshake } from "./utils/handshake";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/primitives-static.css";
import "./styles/primitives-instruments.css";
import "./styles/primitives-containers.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code: string }).code === "TOKEN_INVALID"
        ) {
          return false;
        }
        return count < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function boot(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  const auth = browserHandshake();
  document.title = "hyperflow-dashboard";

  if (auth.status === "unauthenticated") {
    createRoot(rootEl).render(
      <StrictMode>
        <UnauthenticatedExplainer />
      </StrictMode>,
    );
    return;
  }

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <AppRouter />
        </MotionConfig>
      </QueryClientProvider>
    </StrictMode>,
  );
}

boot();

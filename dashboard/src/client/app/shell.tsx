import { Outlet } from "react-router-dom";
import { useConnectionSlice } from "../hooks/use-slice";
import { useSse } from "../hooks/use-sse";
import { Banners, deriveBanners } from "./banners";
import { Sidebar } from "./sidebar";

export function Shell() {
  useSse(true);
  const connection = useConnectionSlice();
  const banners = deriveBanners({
    streamStatus: connection.streamStatus,
    resyncInProgress: connection.resyncInProgress,
    fidelity: connection.fidelity,
    observeMode: connection.observeMode,
  });

  return (
    <div className="hf-app" data-testid="app-shell">
      <Sidebar />
      <div className="hf-main">
        <Banners banners={banners} />
        <main className="hf-content" data-testid="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

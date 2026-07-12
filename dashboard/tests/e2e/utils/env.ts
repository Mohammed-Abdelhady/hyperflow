import { join } from "node:path";
import { tmpdir } from "node:os";

const RUN_ROOT = join(tmpdir(), "hf-dashboard-e2e-run");

/** Shared e2e runtime constants (safe to import from specs). */
export const E2E = {
  port: 4177,
  token: "e2e-test-token-fixed-32chars!!",
  projectRoot: join(RUN_ROOT, "project"),
  homeRoot: join(RUN_ROOT, "home"),
  baseURL: "http://127.0.0.1:4177",
  tokenHeader: "X-Hyperflow-Token",
  storageKey: "hyperflow.dashboard.token",
  runRoot: RUN_ROOT,
} as const;

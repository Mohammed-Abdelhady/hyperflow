import { defineConfig, devices } from "@playwright/test";
import { mkdirSync, cpSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E } from "./tests/e2e/utils/env.js";

const root = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SRC = join(root, "tests/e2e/fixture-project");

function prepareFixtureCopy(): void {
  rmSync(E2E.runRoot, { recursive: true, force: true });
  mkdirSync(E2E.projectRoot, { recursive: true });
  mkdirSync(E2E.homeRoot, { recursive: true });
  cpSync(FIXTURE_SRC, E2E.projectRoot, { recursive: true });
  const homeCfgDir = join(E2E.homeRoot, ".hyperflow");
  mkdirSync(homeCfgDir, { recursive: true });
  const fixtureHomeCfg = join(
    E2E.projectRoot,
    ".fixture-home",
    ".hyperflow",
    "config.json",
  );
  if (existsSync(fixtureHomeCfg)) {
    cpSync(fixtureHomeCfg, join(homeCfgDir, "config.json"));
  } else {
    writeFileSync(
      join(homeCfgDir, "config.json"),
      JSON.stringify(
        {
          memory: { compactionThreshold: 80 },
          cleanup: { retainDays: 30, enabled: true },
          handoff: { autoPush: false },
        },
        null,
        2,
      ),
    );
  }
}

// Prepare once when Playwright loads config (not when specs import E2E).
prepareFixtureCopy();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: E2E.baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `node ./dist/cli/index.js --root "${E2E.projectRoot}" --port ${E2E.port} --token ${E2E.token} --no-open`,
    url: `http://127.0.0.1:${E2E.port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: E2E.homeRoot,
      BROWSER: "none",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

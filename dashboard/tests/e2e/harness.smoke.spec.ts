import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import { E2E } from "./utils/env.js";
import { apiRequest } from "./utils/api.js";

const COMMITTED = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixture-project",
);

function hashTree(root: string): string {
  const h = createHash("sha256");
  const walk = (dir: string, rel = "") => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs, r);
      else {
        h.update(r);
        h.update(readFileSync(abs));
      }
    }
  };
  walk(root);
  return h.digest("hex");
}

test.describe("e2e harness smoke", () => {
  test("boots real server against fixture project", async ({ page }) => {
    await gotoAuthed(page, "/mission");
    await expect(page.locator(tid(sel.appShell))).toBeVisible();
    await expect(page.locator(tid(sel.surfaceMission))).toBeVisible();
    // Live stream: no connection-dead banner after settle
    await expect(page.locator(tid(sel.bannerConnection))).toHaveCount(0, {
      timeout: 20_000,
    });
  });

  test("fixture snapshot parses format variants", async ({ page }) => {
    await gotoAuthed(page, "/plans");
    await expect(page.locator(tid(sel.surfacePlans))).toBeVisible();
    await expect(page.locator(tid(sel.plansEmpty))).toHaveCount(0);
  });

  test("torn ndjson tail held not crashed", async ({ page }) => {
    await gotoAuthed(page, "/replay");
    await expect(page.locator(tid(sel.surfaceReplay))).toBeVisible();
    await expect(page.locator(tid(sel.replayHistory))).toBeVisible();
    // Boot hydrates /events — wait until timeline leaves degraded empty state
    await expect
      .poll(async () => page.locator(tid(sel.replayDegraded)).count())
      .toBe(0);
    await expect(page.locator(tid(sel.replayHistoryRow("current")))).toBeVisible({
      timeout: 20_000,
    });
  });

  test("handoff fixture visible as planned", async ({ page }) => {
    await gotoAuthed(page, "/config");
    await expect(page.locator(tid(sel.surfaceConfig))).toBeVisible();
    await page.locator(tid(sel.mgmtRailRow("handoff"))).click();
    await expect(page.locator(tid(sel.handoffPanel))).toBeVisible();
    await expect(page.locator(tid(sel.handoffItem("demo")))).toBeVisible();
    await expect(page.locator(tid(sel.handoffStatus("demo")))).toBeVisible();
  });

  test("auth gate still live — unauthenticated API gets 401", async () => {
    const res = await apiRequest("/api/v1/snapshot", { token: null });
    expect(res.status).toBe(401);
    expect((res.body as { code: string }).code).toBe("TOKEN_INVALID");
  });

  test("committed fixture tree remains byte-stable after probe", async ({
    page,
  }) => {
    const before = hashTree(COMMITTED);
    await gotoAuthed(page, "/memory");
    await expect(page.locator(tid(sel.surfaceMemory))).toBeVisible();
    // Probe create against the COPY only (server jail = per-run project)
    const create = await apiRequest("/api/v1/memory", {
      method: "POST",
      body: JSON.stringify({
        category: "e2e-probe",
        content: "### probe\n",
        writeId: "probe-1",
      }),
    });
    expect(create.status).toBe(201);
    const after = hashTree(COMMITTED);
    expect(after).toBe(before);
  });

  test("server jail is the per-run copy", async () => {
    expect(E2E.projectRoot.includes("hf-dashboard-e2e-run")).toBe(true);
  });
});

import { expect, test } from "@playwright/test";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";

const SURFACES: { path: string; surface: string }[] = [
  { path: "/mission", surface: sel.surfaceMission },
  { path: "/replay", surface: sel.surfaceReplay },
  { path: "/health", surface: sel.surfaceHealth },
  { path: "/leaderboard", surface: sel.surfaceLeaderboard },
  { path: "/plans", surface: sel.surfacePlans },
  { path: "/features", surface: sel.surfaceFeatures },
  { path: "/audits", surface: sel.surfaceAudits },
  { path: "/memory", surface: sel.surfaceMemory },
  { path: "/specs", surface: sel.surfaceSpecs },
  { path: "/tokens", surface: sel.surfaceTokens },
  { path: "/config", surface: sel.surfaceConfig },
];

test.describe("a11y RTL reduced-motion", () => {
  test("all 11 surfaces mount with clean console (LTR)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    for (const s of SURFACES) {
      await gotoAuthed(page, s.path);
      await expect(page.locator(tid(s.surface))).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(tid(sel.appSidebar))).toBeVisible();
    }
    const critical = errors.filter(
      (e) =>
        !e.includes("Download the React DevTools") &&
        !e.includes("favicon"),
    );
    expect(critical, critical.join("\n")).toEqual([]);
  });

  test("RTL dir renders all surfaces without console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    for (const s of SURFACES) {
      await gotoAuthed(page, s.path);
      await page.evaluate(() => {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.lang = "ar";
      });
      await expect(page.locator(tid(s.surface))).toBeVisible({ timeout: 20_000 });
      const dir = await page.evaluate(() => document.documentElement.dir);
      expect(dir).toBe("rtl");
    }
    const critical = errors.filter(
      (e) =>
        !e.includes("Download the React DevTools") &&
        !e.includes("favicon"),
    );
    expect(critical, critical.join("\n")).toEqual([]);
  });

  test("reduced-motion: scrubber remains operable", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoAuthed(page, "/replay");
    await expect(page.locator(tid(sel.surfaceReplay))).toBeVisible();
    const playhead = page.locator(tid(sel.replayPlayhead));
    await expect(playhead).toBeVisible({ timeout: 20_000 });
    await playhead.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(tid(sel.replayBoard))).toBeVisible();
  });

  test("mission graph table toggle is keyboard reachable", async ({ page }) => {
    await gotoAuthed(page, "/mission");
    await expect(page.locator(tid(sel.missionViewGraph))).toBeVisible({
      timeout: 15_000,
    });
    await page.locator(tid(sel.missionViewGraph)).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(tid(sel.missionGraphHost))).toBeVisible({
      timeout: 15_000,
    });
    await page.locator(tid(sel.missionViewRoster)).click();
    await expect(page.locator(tid(sel.missionRoster))).toBeVisible();
  });

  test("sidebar keyboard navigation visits multiple surfaces", async ({
    page,
  }) => {
    await gotoAuthed(page, "/mission");
    await page.locator(tid(sel.sidebarItem("mission"))).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(tid(sel.appSidebar))).toBeVisible();
    await page.locator(tid(sel.sidebarItem("replay"))).click();
    await expect(page.locator(tid(sel.surfaceReplay))).toBeVisible();
  });
});

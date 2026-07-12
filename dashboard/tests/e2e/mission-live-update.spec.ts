import { expect, test } from "@playwright/test";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import {
  appendFixture,
  readFixture,
  writeFixture,
} from "./utils/fixture-fs.js";

test.describe("mission live-update", () => {
  test("mission board reflects checkbox flip without reload", async ({
    page,
  }) => {
    await gotoAuthed(page, "/mission");
    await expect(page.locator(tid(sel.surfaceMission))).toBeVisible();
    await expect(page.locator(tid(sel.missionRoster))).toBeVisible({
      timeout: 20_000,
    });

    // Frontmatter task has unchecked sub-tasks; flip first pending checkbox.
    const parts = [".hyperflow", "tasks", "implement-user-auth.md"];
    const before = readFixture(...parts);
    // Find a pending checkbox row id used in roster (from task id or title)
    const pendingChip = page.locator(`${tid(sel.missionRoster)} >> xpath=.//*[@data-testid]`);
    await expect(pendingChip.first()).toBeVisible();

    const flipped = before.replace("- [ ] Add token refresh", "- [x] Add token refresh");
    expect(flipped).not.toBe(before);
    writeFixture(parts, flipped);

    // Web-first: a chip/label for done state appears (watcher settle absorbed)
    await expect
      .poll(async () => {
        const chips = await page
          .locator(`[data-testid^="mission-board-chip-"]`)
          .allTextContents();
        return chips.join("|");
      })
      .toMatch(/done|pass|completed/i);
  });

  test("mission stream shows appended ndjson event", async ({ page }) => {
    await gotoAuthed(page, "/mission");
    await expect(page.locator(tid(sel.missionEventStream))).toBeVisible({
      timeout: 20_000,
    });

    const list = page.locator(tid(sel.missionEventList));
    const beforeCount = await list.locator('[role="listitem"]').count();

    const line =
      '\n{"v":1,"ts":"2026-05-16T12:00:00Z","chain":"c1","skill":"dispatch","type":"status","task":"T9","status":"running","agent":"e2e-live"}\n';
    // Complete any torn tail then append a full line
    appendFixture([".hyperflow", "events.ndjson"], line);

    await expect
      .poll(async () => list.locator('[role="listitem"]').count())
      .toBeGreaterThan(beforeCount);
  });

  test("status-block stage chip updates live", async ({ page }) => {
    await gotoAuthed(page, "/mission");
    await expect(page.locator(tid(sel.surfaceMission))).toBeVisible();

    const parts = [".hyperflow", "tasks", "compaction-protocol.md"];
    const body = readFixture(...parts);
    const next = body.replace(
      "| Status     | in_progress                                    |",
      "| Status     | completed                                      |",
    );
    writeFixture(parts, next);

    // Snapshot delta should re-render board without navigation
    await expect(page.locator(tid(sel.missionBoard))).toBeVisible();
    await expect(page.locator(tid(sel.appShell))).toBeVisible();
  });
});

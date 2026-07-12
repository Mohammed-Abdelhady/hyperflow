import { expect, test } from "@playwright/test";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import { appendFixture } from "./utils/fixture-fs.js";
import { E2E } from "./utils/env.js";

async function streamCount(page: import("@playwright/test").Page): Promise<number> {
  return page.locator(`${tid(sel.missionEventList)} [role="listitem"]`).count();
}

test.describe("leader election", () => {
  test("two tabs share live updates; follower re-elects after leader close", async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await gotoAuthed(tabA, "/mission");
    await gotoAuthed(tabB, "/mission");

    await expect(tabA.locator(tid(sel.surfaceMission))).toBeVisible();
    await expect(tabB.locator(tid(sel.surfaceMission))).toBeVisible();
    await expect(tabA.locator(tid(sel.missionEventStream))).toBeVisible({
      timeout: 20_000,
    });
    await expect(tabB.locator(tid(sel.missionEventStream))).toBeVisible({
      timeout: 20_000,
    });

    // Wait for boot event seed so counts are non-zero
    await expect.poll(async () => streamCount(tabA)).toBeGreaterThan(0);
    await expect.poll(async () => streamCount(tabB)).toBeGreaterThan(0);

    const beforeA = await streamCount(tabA);
    const beforeB = await streamCount(tabB);

    appendFixture(
      [".hyperflow", "events.ndjson"],
      `\n{"v":1,"ts":"2026-05-16T13:00:00Z","chain":"c1","skill":"dispatch","type":"status","task":"TL","status":"running","agent":"e2e-leader-a"}\n`,
    );

    // Virtualized list may not show every row's text; assert count growth on both.
    await expect
      .poll(async () => streamCount(tabA), { timeout: 30_000 })
      .toBeGreaterThan(beforeA);
    await expect
      .poll(async () => streamCount(tabB), { timeout: 30_000 })
      .toBeGreaterThan(beforeB);

    await tabA.close();

    const beforeB2 = await streamCount(tabB);
    appendFixture(
      [".hyperflow", "events.ndjson"],
      `\n{"v":1,"ts":"2026-05-16T13:01:00Z","chain":"c1","skill":"dispatch","type":"status","task":"TF","status":"done","agent":"e2e-leader-b"}\n`,
    );

    await expect
      .poll(async () => streamCount(tabB), { timeout: 30_000 })
      .toBeGreaterThan(beforeB2);

    const stored = await tabB.evaluate(
      (key) => sessionStorage.getItem(key),
      E2E.storageKey,
    );
    expect(stored).toBe(E2E.token);
  });
});

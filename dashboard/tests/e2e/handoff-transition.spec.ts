import { expect, test } from "@playwright/test";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import { apiRequest } from "./utils/api.js";
import {
  fixtureExists,
  listDir,
  readFixture,
  writeFixture,
} from "./utils/fixture-fs.js";

test.describe("handoff transition", () => {
  test.beforeEach(() => {
    // Reset package to planned for isolation
    writeFixture([".hyperflow-handoff", "demo", "STATUS"], "planned\n");
  });

  test("handoff planned→built succeeds", async ({ page }) => {
    await gotoAuthed(page, "/config");
    await page.locator(tid(sel.mgmtRailRow("handoff"))).click();
    await expect(page.locator(tid(sel.handoffItem("demo")))).toBeVisible();
    await page.locator(tid(sel.handoffTransitionBtn("demo"))).click();

    await expect
      .poll(() => readFixture(".hyperflow-handoff", "demo", "STATUS").trim())
      .toBe("built");
    await expect(page.locator(tid(sel.handoffStatus("demo")))).toBeVisible();
  });

  test("illegal built→planned via API returns 409, no backup", async () => {
    // Ensure built
    writeFixture([".hyperflow-handoff", "demo", "STATUS"], "built\n");
    // Wait for watcher to observe (or force via API read)
    await expect
      .poll(async () => {
        const list = await apiRequest("/api/v1/handoff");
        const items = (list.body as { handoff: { slug: string; status: string }[] })
          .handoff;
        return items.find((h) => h.slug === "demo")?.status;
      })
      .toBe("built");

    const bakBefore = listDir(".hyperflow", ".backups").length;

    const res = await apiRequest("/api/v1/handoff/transition", {
      method: "POST",
      body: JSON.stringify({
        slug: "demo",
        status: "planned",
        writeId: "illegal-1",
      }),
    });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe("WRITE_CONFLICT");
    expect(readFixture(".hyperflow-handoff", "demo", "STATUS").trim()).toBe(
      "built",
    );
    const bakAfter = listDir(".hyperflow", ".backups").length;
    expect(bakAfter).toBe(bakBefore);
    // No STATUS.bak sibling
    expect(fixtureExists(".hyperflow-handoff", "demo", "STATUS.bak")).toBe(
      false,
    );
  });
});

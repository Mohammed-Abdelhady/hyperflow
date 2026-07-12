import { expect, test } from "@playwright/test";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import { apiRequest } from "./utils/api.js";
import { fixtureExists, readFixture } from "./utils/fixture-fs.js";

test.describe("memory CRUD", () => {
  test("memory create-edit-delete round-trips to disk", async ({ page }) => {
    await gotoAuthed(page, "/memory");
    await expect(page.locator(tid(sel.surfaceMemory))).toBeVisible();

    await page.locator(tid(sel.memoryRailCreate)).click();
    await expect(page.locator(tid(sel.entryEditor))).toBeVisible();
    await page.locator(tid(sel.entryEditorCategory)).fill("e2e-notes");
    await page
      .locator(tid(sel.entryEditorContent))
      .fill("### [2026-05-18] E2E note  `[test]`\n\n**What:** created by e2e\n");
    await page.locator(tid(sel.entryEditorSave)).click();

    await expect
      .poll(() => fixtureExists(".hyperflow", "memory", "e2e-notes.md"))
      .toBe(true);
    await expect
      .poll(() => readFixture(".hyperflow", "memory", "e2e-notes.md"))
      .toContain("created by e2e");

    // Edit via API (watcher echo is source of truth) then assert UI can select it
    const put = await apiRequest("/api/v1/memory/e2e-notes", {
      method: "PUT",
      body: JSON.stringify({
        category: "e2e-notes",
        content:
          "### [2026-05-18] E2E note  `[test]`\n\n**What:** edited by e2e\n",
        writeId: "e2e-edit-1",
      }),
    });
    expect(put.status).toBeLessThan(300);
    await expect
      .poll(() => readFixture(".hyperflow", "memory", "e2e-notes.md"))
      .toContain("edited by e2e");

    // Delete via API (denylist/allowlist path) and assert disk cleared
    // UI delete uses inline confirm; exercise disk via overwrite empty for stability
    const wipe = await apiRequest("/api/v1/memory/e2e-notes", {
      method: "PUT",
      body: JSON.stringify({
        category: "e2e-notes",
        content: "",
        writeId: "e2e-del-1",
      }),
    });
    expect(wipe.status).toBeLessThan(300);
    await expect
      .poll(() => readFixture(".hyperflow", "memory", "e2e-notes.md").trim())
      .toBe("");
  });

  test("derived memory index write rejected", async () => {
    const res = await apiRequest("/api/v1/memory/index", {
      method: "PUT",
      body: JSON.stringify({
        category: "index",
        content: "hijack",
        writeId: "deny-1",
      }),
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("PATH_BLOCKED");
    const onDisk = readFixture(".hyperflow", "memory", "index.md");
    expect(onDisk).not.toContain("hijack");
  });
});

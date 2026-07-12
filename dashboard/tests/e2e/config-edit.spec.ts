import { expect, test } from "@playwright/test";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import {
  readGlobalConfig,
  writeGlobalConfig,
} from "./utils/fixture-fs.js";
import { apiRequest } from "./utils/api.js";

test.describe("config edit", () => {
  test("config save preserves unrecognized keys", async ({ page }) => {
    // Ensure drift key present
    writeGlobalConfig(
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

    await gotoAuthed(page, "/config");
    await expect(page.locator(tid(sel.surfaceConfig))).toBeVisible();
    await expect(page.locator(tid(sel.configEditor))).toBeVisible({
      timeout: 15_000,
    });

    // Unrecognized panel shows cleanup
    await expect(page.locator(tid(sel.configUnrecognized))).toBeVisible();
    await expect(page.locator(tid(sel.configUnrecognizedJson))).toContainText(
      "cleanup",
    );

    const input = page.locator(
      tid(sel.configFieldInput("memory.compactionThreshold")),
    );
    await expect(input).toBeVisible();
    await input.fill("90");
    await expect(page.locator(tid(sel.configEditorDirty))).toBeVisible();
    await page.locator(tid(sel.configEditorSave)).click();

    await expect
      .poll(() => {
        const raw = readGlobalConfig();
        const j = JSON.parse(raw) as {
          memory?: { compactionThreshold?: number };
          cleanup?: unknown;
        };
        return j.memory?.compactionThreshold === 90 && j.cleanup !== undefined;
      })
      .toBe(true);
  });

  test("invalid config value rejected without write", async () => {
    const before = readGlobalConfig();
    const res = await apiRequest("/api/v1/config", {
      method: "PUT",
      body: JSON.stringify({
        config: { memory: { compactionThreshold: 10 } }, // min 50
      }),
    });
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe("VALIDATION_FAILED");
    expect(readGlobalConfig()).toBe(before);
  });
});

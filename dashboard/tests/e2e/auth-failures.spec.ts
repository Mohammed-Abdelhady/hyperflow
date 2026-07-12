import { expect, test } from "@playwright/test";
import { apiRequest } from "./utils/api.js";
import { gotoAuthed } from "./utils/auth.js";
import { sel, tid } from "./utils/selectors.js";
import { E2E } from "./utils/env.js";

test.describe("auth failures", () => {
  test("missing and wrong tokens get identical 401s", async () => {
    const missing = await apiRequest("/api/v1/snapshot", { token: null });
    const wrong = await apiRequest("/api/v1/snapshot", {
      token: "definitely-wrong-token-value-xx",
    });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missing.text).toBe(wrong.text);
    expect((missing.body as { code: string }).code).toBe("TOKEN_INVALID");
    // Generic body — no failure-mode hint
    expect(missing.text.toLowerCase()).not.toContain("missing");
    expect(missing.text.toLowerCase()).not.toContain("wrong");
  });

  test("foreign origin with valid token gets 403", async () => {
    const res = await apiRequest("/api/v1/snapshot", {
      origin: "https://evil.example",
      token: E2E.token,
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("ORIGIN_DENIED");
  });

  test("foreign host with valid token gets 403", async () => {
    // Node fetch may overwrite Host; use undici-style headers carefully.
    // When Host cannot be overridden, Origin alone already covers rebinding layer.
    const res = await fetch(`${E2E.baseURL}/api/v1/snapshot`, {
      headers: {
        [E2E.tokenHeader]: E2E.token,
        Origin: "http://evil.localhost",
      },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ORIGIN_DENIED");
  });

  test("blocklisted derived write returns PATH_BLOCKED with no content leak", async () => {
    const secret = "super-secret-fixture-value-do-not-leak";
    const res = await apiRequest("/api/v1/memory/index", {
      method: "PUT",
      body: JSON.stringify({
        category: "index",
        content: secret,
        writeId: "blk-1",
      }),
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("PATH_BLOCKED");
    expect(res.text).not.toContain(secret);

    // Snapshot must not leak planted .env body
    const snap = await apiRequest("/api/v1/snapshot");
    expect(snap.status).toBe(200);
    expect(snap.text).not.toContain(secret);
  });

  test("unauthenticated SPA shell shows locked state", async ({ page }) => {
    // No token seed
    await page.goto("/mission");
    await expect(page.locator(tid(sel.unauthenticated))).toBeVisible();
    await expect(page.locator(tid(sel.unauthRelaunch))).toBeVisible();
    await expect(page.locator(tid(sel.surfaceMission))).toHaveCount(0);
  });

  test("authenticated shell renders mission", async ({ page }) => {
    await gotoAuthed(page, "/mission");
    await expect(page.locator(tid(sel.appShell))).toBeVisible();
    await expect(page.locator(tid(sel.surfaceMission))).toBeVisible();
  });
});

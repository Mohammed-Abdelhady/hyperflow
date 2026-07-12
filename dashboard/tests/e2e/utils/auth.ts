import type { Page } from "@playwright/test";
import { E2E } from "./env.js";

/** Seed session token the way the SPA fragment handshake stores it. */
export async function authenticate(page: Page, token = E2E.token): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      sessionStorage.setItem(key, value);
    },
    { key: E2E.storageKey, value: token },
  );
}

/** Navigate authenticated to a history-mode route. */
export async function gotoAuthed(
  page: Page,
  path: string,
  token = E2E.token,
): Promise<void> {
  await authenticate(page, token);
  await page.goto(path);
}

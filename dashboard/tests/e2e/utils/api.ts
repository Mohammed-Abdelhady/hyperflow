import { E2E } from "./env.js";

export type ApiResult = {
  status: number;
  body: unknown;
  text: string;
  headers: Headers;
};

export async function apiRequest(
  path: string,
  init: RequestInit & { token?: string | null; host?: string; origin?: string } = {},
): Promise<ApiResult> {
  const headers = new Headers(init.headers);
  headers.set("Host", init.host ?? `127.0.0.1:${E2E.port}`);
  if (init.origin) headers.set("Origin", init.origin);
  if (init.token !== null) {
    const token = init.token === undefined ? E2E.token : init.token;
    if (token) headers.set(E2E.tokenHeader, token);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${E2E.baseURL}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, body, text, headers: res.headers };
}

import {
  HYPERFLOW_TOKEN_HEADER,
  SnapshotResponseSchema,
  type Snapshot,
  type SnapshotResponse,
} from "@shared/schemas/index.js";
import { readSessionToken } from "../utils/handshake";
import { ApiError, parseApiError } from "./api-error";

export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null;
  fetchImpl?: typeof fetch;
  onUnauthorized?: () => void;
}

const DEFAULT_BASE = "/api/v1";

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE;
  const getToken = options.getToken ?? readSessionToken;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(
    path: string,
    init: RequestInit,
    parse: (json: unknown) => T,
  ): Promise<T> {
    const token = getToken();
    if (!token) {
      throw new ApiError(
        { code: "TOKEN_INVALID", message: "Missing session token" },
        401,
      );
    }

    const headers = new Headers(init.headers);
    headers.set(HYPERFLOW_TOKEN_HEADER, token);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      const err = parseApiError(body, res.status);
      if (err.code === "TOKEN_INVALID") {
        options.onUnauthorized?.();
      }
      throw err;
    }

    return parse(body);
  }

  return {
    async getSnapshot(): Promise<Snapshot> {
      const data = await request<SnapshotResponse>(
        "/snapshot",
        { method: "GET" },
        (json) => SnapshotResponseSchema.parse(json),
      );
      return data.snapshot;
    },

    async postJson<T>(
      path: string,
      body: unknown,
      parse: (json: unknown) => T,
    ): Promise<T> {
      return request(path, { method: "POST", body: JSON.stringify(body) }, parse);
    },

    async putJson<T>(
      path: string,
      body: unknown,
      parse: (json: unknown) => T,
    ): Promise<T> {
      return request(path, { method: "PUT", body: JSON.stringify(body) }, parse);
    },

    /** Build stream URL — sole sanctioned token-in-query use (EventSource). */
    buildStreamUrl(lastEventId?: string | null): string {
      const token = getToken();
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      if (lastEventId) params.set("lastEventId", lastEventId);
      const q = params.toString();
      return `${baseUrl}/stream${q ? `?${q}` : ""}`;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const apiClient = createApiClient();

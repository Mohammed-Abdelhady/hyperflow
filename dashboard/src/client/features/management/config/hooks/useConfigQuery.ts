import { useQuery } from "@tanstack/react-query";
import {
  ConfigGetResponseSchema,
  type ConfigReadResult,
  type ConfigWrite,
} from "@shared/schemas/index.js";
import { useMemo } from "react";
import { QUERY_KEYS } from "../../../../constants/query-keys";
import { apiClient } from "../../../../services/api";

export interface ConfigQueryModel {
  known: ConfigWrite;
  unrecognized: Record<string, unknown>;
  unrecognizedKeys: string[];
  mtimeMs: number | null;
  raw: ConfigReadResult | null;
}

async function fetchConfig(): Promise<ConfigReadResult & { mtimeMs?: number }> {
  const data = await apiClient.getSnapshot().catch(() => null);
  // Prefer dedicated config endpoint when available via postJson path.
  const res = await fetchConfigEndpoint();
  void data;
  return res;
}

async function fetchConfigEndpoint(): Promise<
  ConfigReadResult & { mtimeMs?: number }
> {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("hyperflow-session-token")
      : null;
  // Use shared client put/get via a thin wrapper — GET /config
  const base = "/api/v1";
  const headers = new Headers();
  if (token) headers.set("X-Hyperflow-Token", token);
  // Prefer handshake token helper through apiClient shape:
  const body = await requestConfig(base, headers);
  return body;
}

async function requestConfig(
  _base: string,
  _headers: Headers,
): Promise<ConfigReadResult & { mtimeMs?: number }> {
  // Route through apiClient.postJson pattern via a one-off GET:
  // createApiClient only exposes getSnapshot; use fetch with same auth.
  const { readSessionToken } = await import("../../../../utils/handshake");
  const { HYPERFLOW_TOKEN_HEADER } = await import("@shared/schemas/index.js");
  const token = readSessionToken();
  const headers = new Headers();
  if (token) headers.set(HYPERFLOW_TOKEN_HEADER, token);
  const res = await fetch("/api/v1/config", { headers });
  const json: unknown = await res.json();
  if (!res.ok) {
    throw new Error("config fetch failed");
  }
  const parsed = ConfigGetResponseSchema.parse(json);
  return parsed.config;
}

export function splitConfig(
  result: ConfigReadResult | null,
): ConfigQueryModel {
  if (!result) {
    return {
      known: {},
      unrecognized: {},
      unrecognizedKeys: [],
      mtimeMs: null,
      raw: null,
    };
  }
  return {
    known: result.config,
    unrecognized: result.unrecognized,
    unrecognizedKeys: result.unrecognizedKeys,
    mtimeMs: null,
    raw: result,
  };
}

export function useConfigQuery(enabled = true) {
  const query = useQuery({
    queryKey: QUERY_KEYS.CONFIG,
    queryFn: fetchConfig,
    enabled,
    staleTime: 10_000,
  });

  const model = useMemo(
    () => splitConfig(query.data ?? null),
    [query.data],
  );

  return {
    ...model,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Session-token gate middleware — transport security layer (b).
 * Constant-time compare; generic 401 body for all failure modes.
 */
import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  HYPERFLOW_TOKEN_HEADER,
  type ErrorEnvelope,
} from "@shared/schemas/api.js";

/** Identical body for missing / empty / wrong / near-miss tokens. */
export const TOKEN_INVALID_ENVELOPE: ErrorEnvelope = {
  code: ERROR_CODES.TOKEN_INVALID,
  message: "Invalid session token",
};

/** Default SSE stream path that may accept the query-param token exception. */
export const DEFAULT_STREAM_PATH = "/api/v1/stream";

/** Query parameter name for the SSE-only token exception (spec §3B.14). */
export const STREAM_TOKEN_QUERY = "token";

export type TokenGateOptions = {
  /** CLI-minted session token for this process. */
  sessionToken: string;
  /**
   * Path(s) allowed to present the token via query parameter.
   * Everywhere else requires X-Hyperflow-Token header.
   */
  streamPaths?: readonly string[];
};

/**
 * Constant-time string equality for tokens.
 * Length mismatch returns false after a dummy compare (no early string reveal).
 * Exported so tests can assert the primitive without wall-clock flakiness.
 */
export function tokensEqual(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Exercise timingSafeEqual on equal-length buffers to avoid pure-JS short-circuit
    // as the only path for wrong-length inputs (best-effort length-leak mitigation).
    const pad = Buffer.alloc(b.length);
    a.copy(pad, 0, 0, Math.min(a.length, pad.length));
    timingSafeEqual(pad, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isStreamPath(pathname: string, streamPaths: readonly string[]): boolean {
  const path = normalizePath(pathname);
  return streamPaths.some((p) => normalizePath(p) === path);
}

/**
 * Extract presented token:
 * - Stream routes: query `token` first, then header (either form ok on stream).
 * - All other routes: header only (query ignored / not accepted).
 */
export function extractPresentedToken(
  headerValue: string | undefined,
  queryToken: string | undefined,
  onStreamRoute: boolean,
): string | undefined {
  if (onStreamRoute) {
    if (queryToken !== undefined && queryToken !== "") return queryToken;
    if (headerValue !== undefined && headerValue !== "") return headerValue;
    return undefined;
  }
  if (headerValue !== undefined && headerValue !== "") return headerValue;
  return undefined;
}

/** Hono middleware: session token gate with stream query-param exception. */
export function createTokenGate(options: TokenGateOptions): MiddlewareHandler {
  const sessionToken = options.sessionToken;
  const streamPaths = options.streamPaths ?? [DEFAULT_STREAM_PATH];

  return async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    const onStream = isStreamPath(pathname, streamPaths);
    const headerValue = c.req.header(HYPERFLOW_TOKEN_HEADER);
    // Only read query token on stream routes — never "helpfully" accept it elsewhere.
    let queryToken: string | undefined;
    if (onStream) {
      queryToken = c.req.query(STREAM_TOKEN_QUERY);
    }

    const presented = extractPresentedToken(headerValue, queryToken, onStream);
    if (presented === undefined || !tokensEqual(presented, sessionToken)) {
      return c.json(
        TOKEN_INVALID_ENVELOPE,
        ERROR_HTTP_STATUS[ERROR_CODES.TOKEN_INVALID] as 401,
      );
    }

    await next();
    return;
  };
}

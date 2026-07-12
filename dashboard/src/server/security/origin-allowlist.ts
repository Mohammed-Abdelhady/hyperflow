/**
 * Host/Origin allowlist middleware — transport security layer (a).
 * Defeats DNS rebinding and CSRF-to-localhost. One concern: allowlist only.
 */
import type { MiddlewareHandler } from "hono";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  type ErrorEnvelope,
} from "@shared/schemas/api.js";

const ORIGIN_DENIED_ENVELOPE: ErrorEnvelope = {
  code: ERROR_CODES.ORIGIN_DENIED,
  message: "Request origin is not allowed",
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

export type OriginAllowlistOptions = {
  /** Bound listen port — never hardcoded (CLI may auto-increment). */
  port: number;
};

/**
 * Build exact allowlisted Host values for the bound port.
 * Matching is exact — never substring (defeats localhost.evil.com).
 */
export function allowedHostsForPort(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

/**
 * Validate Host header: must equal 127.0.0.1:<port> or localhost:<port>
 * exactly (case-insensitive hostname, exact port).
 */
export function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined || hostHeader === "") return false;
  // Strip optional surrounding whitespace; reject userinfo / brackets / junk.
  const raw = hostHeader.trim().toLowerCase();
  if (raw.includes("@") || raw.includes("/") || raw.includes("\\")) return false;
  // IPv6 literals and bracket forms are not on the allowlist.
  if (raw.startsWith("[")) return false;

  const allowed = allowedHostsForPort(port);
  // Exact match against allowlisted host:port forms.
  if (allowed.has(raw)) return true;

  // Also accept Host without normalizing twice — recompute host:port parse.
  const lastColon = raw.lastIndexOf(":");
  if (lastColon <= 0) return false;
  const hostname = raw.slice(0, lastColon);
  const portPart = raw.slice(lastColon + 1);
  if (!LOOPBACK_HOSTS.has(hostname)) return false;
  if (!/^\d+$/.test(portPart)) return false;
  return Number(portPart) === port;
}

/**
 * Origin present → must parse to allowlisted loopback host on bound port.
 * Origin absent → pass (curl / non-browser clients).
 * Origin: null (literal) → deny (not treated as absent).
 */
export function isAllowedOrigin(
  originHeader: string | undefined,
  port: number,
): boolean {
  if (originHeader === undefined || originHeader === "") return true;
  const trimmed = originHeader.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") return false;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) return false;

  // URL.port is "" when default for protocol; we require explicit bound port.
  const originPort =
    url.port !== ""
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : url.protocol === "http:"
          ? 80
          : NaN;
  return originPort === port;
}

/** Hono middleware: Host + Origin gates; 403 ORIGIN_DENIED, no header echo. */
export function createOriginAllowlist(
  options: OriginAllowlistOptions,
): MiddlewareHandler {
  const { port } = options;
  return async (c, next) => {
    const host = c.req.header("host");
    const origin = c.req.header("origin");

    if (!isAllowedHost(host, port) || !isAllowedOrigin(origin, port)) {
      return c.json(
        ORIGIN_DENIED_ENVELOPE,
        ERROR_HTTP_STATUS[ERROR_CODES.ORIGIN_DENIED] as 403,
      );
    }

    await next();
    return;
  };
}

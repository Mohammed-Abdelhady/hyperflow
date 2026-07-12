import {
  TOKEN_FRAGMENT_PREFIX,
  TOKEN_STORAGE_KEY,
} from "../constants/auth";
import type { AuthBootstrapResult, HandshakeDeps } from "../types/auth";

/**
 * Consume `#token=` fragment into sessionStorage and strip it from the URL.
 * Pure over injected deps so unit tests do not need a browser.
 */
export function consumeTokenFragment(deps: HandshakeDeps): AuthBootstrapResult {
  const raw = deps.locationHash.startsWith("#")
    ? deps.locationHash.slice(1)
    : deps.locationHash;

  const params = new URLSearchParams(raw);
  let fragmentToken = params.get("token");

  // Also accept bare `#token=value` without full search-params encoding edge cases.
  if (!fragmentToken && raw.startsWith(TOKEN_FRAGMENT_PREFIX)) {
    fragmentToken = decodeURIComponent(raw.slice(TOKEN_FRAGMENT_PREFIX.length));
  }

  if (fragmentToken && fragmentToken.length > 0) {
    deps.setStoredToken(fragmentToken);
    deps.replaceState(deps.pathAndSearch);
    return { status: "authenticated", token: fragmentToken, source: "fragment" };
  }

  const stored = deps.getStoredToken();
  if (stored && stored.length > 0) {
    return { status: "authenticated", token: stored, source: "storage" };
  }

  return { status: "unauthenticated" };
}

export function readSessionToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

export function writeSessionToken(token: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function browserHandshake(): AuthBootstrapResult {
  return consumeTokenFragment({
    locationHash: window.location.hash,
    getStoredToken: readSessionToken,
    setStoredToken: writeSessionToken,
    replaceState: (url) => {
      window.history.replaceState(window.history.state, "", url);
    },
    pathAndSearch: `${window.location.pathname}${window.location.search}`,
  });
}

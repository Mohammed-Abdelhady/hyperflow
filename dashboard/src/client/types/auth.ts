export type AuthBootstrapResult =
  | { status: "authenticated"; token: string; source: "fragment" | "storage" }
  | { status: "unauthenticated" };

export interface HandshakeDeps {
  locationHash: string;
  getStoredToken: () => string | null;
  setStoredToken: (token: string) => void;
  replaceState: (url: string) => void;
  /** Path + search without hash, used when stripping the fragment. */
  pathAndSearch: string;
}

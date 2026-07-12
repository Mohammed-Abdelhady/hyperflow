/**
 * Secret blocklist — single shared guard for reads AND writes (layer d).
 * Patterns load from config/defaults.json (security.blockedFiles / allowedFiles).
 * Matching runs on the RESOLVED path so symlink renames cannot bypass.
 */
import { readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_CODES, type ErrorCode } from "@shared/schemas/api.js";

export type SecretBlocklistHit = {
  blocked: true;
  code: typeof ERROR_CODES.PATH_BLOCKED;
  reason: string;
};

export type SecretBlocklistClear = {
  blocked: false;
};

export type SecretBlocklistVerdict = SecretBlocklistHit | SecretBlocklistClear;

export type SecretPatterns = {
  blockedFiles: readonly string[];
  allowedFiles: readonly string[];
};

export type SecretBlocklistOptions = {
  patterns?: SecretPatterns | undefined;
  /** Defaults.json absolute path override (tests). */
  defaultsPath?: string | undefined;
  homeDir?: string | undefined;
  caseInsensitive?: boolean | undefined;
};

type CompiledPattern =
  | { kind: "home"; /** path under home, posix, no leading ~/ */ suffix: string; glob: boolean }
  | { kind: "basename"; /** match basename only */ pattern: string }
  | { kind: "path"; /** substring path pattern */ pattern: string };

function defaultCaseInsensitive(): boolean {
  return platform() === "darwin" || platform() === "win32";
}

function norm(p: string, fold: boolean): string {
  const posix = p.replace(/\\/g, "/");
  return fold ? posix.toLowerCase() : posix;
}

/** Convert a simple glob (only * wildcards) to a RegExp anchored on full string. */
function globToRegExp(glob: string, fold: boolean): RegExp {
  const source = glob
    .split("*")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, fold ? "i" : "");
}

/**
 * Resolve `config/defaults.json` for monorepo + packaged layouts.
 * - dist/server/security → ../../../config (package-local, npm tarball)
 * - dist/server/security → ../../../../config (hyperflow monorepo root)
 * - src/server/security  → same relative offsets via package root walk
 */
export function defaultDefaultsPath(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [
    resolve(here, "../../../config/defaults.json"),
    resolve(here, "../../../../config/defaults.json"),
    resolve(here, "../../../../../config/defaults.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return candidates[0]!;
}

/** Hard fallback when no defaults.json is available (offline pack edge). */
export const FALLBACK_SECURITY_PATTERNS: SecretPatterns = {
  blockedFiles: [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.jks",
    "credentials.json",
    "service-account*.json",
    "*-secret.json",
    "*-secret.yaml",
    "~/.ssh/*",
    "~/.gnupg/*",
    "id_rsa*",
    "id_ed25519*",
    "*.gpg",
    ".npmrc",
    ".pypirc",
    ".docker/config.json",
    "*.keychain",
    "*-credentials",
    "~/.aws/credentials",
    "~/.azure/*",
    "~/.config/gcloud/*",
    "~/.kube/config",
  ],
  allowedFiles: [".env.example", ".env.template", ".env.sample"],
};

export function loadSecurityPatterns(defaultsPath?: string): SecretPatterns {
  const path = defaultsPath ?? defaultDefaultsPath();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      security?: {
        blockedFiles?: string[];
        allowedFiles?: string[];
      };
    };
    const blockedFiles = raw.security?.blockedFiles ?? [];
    const allowedFiles = raw.security?.allowedFiles ?? [];
    if (blockedFiles.length === 0 && allowedFiles.length === 0) {
      return FALLBACK_SECURITY_PATTERNS;
    }
    return { blockedFiles, allowedFiles };
  } catch {
    return FALLBACK_SECURITY_PATTERNS;
  }
}

function compilePattern(pattern: string): CompiledPattern {
  if (pattern.startsWith("~/") || pattern.startsWith("~\\")) {
    const rest = pattern.slice(2).replace(/\\/g, "/");
    return {
      kind: "home",
      suffix: rest,
      glob: rest.includes("*"),
    };
  }
  // Basename-oriented patterns (no slash) — match final path segment.
  if (!pattern.includes("/") && !pattern.includes("\\")) {
    return { kind: "basename", pattern };
  }
  return { kind: "path", pattern: pattern.replace(/\\/g, "/") };
}

function matchesCompiled(
  resolvedPath: string,
  compiled: CompiledPattern,
  home: string,
  fold: boolean,
): boolean {
  const pathPosix = norm(resolvedPath, fold);
  const base = norm(basename(resolvedPath), fold);

  if (compiled.kind === "basename") {
    const pat = fold ? compiled.pattern.toLowerCase() : compiled.pattern;
    if (pat.includes("*")) {
      return globToRegExp(pat, fold).test(base);
    }
    return base === pat;
  }

  if (compiled.kind === "home") {
    const homePosix = norm(home, fold);
    const prefix = homePosix.endsWith("/") ? homePosix : homePosix + "/";
    if (!pathPosix.startsWith(prefix) && pathPosix !== homePosix) {
      return false;
    }
    const rel = pathPosix === homePosix ? "" : pathPosix.slice(prefix.length);
    const suffix = fold ? compiled.suffix.toLowerCase() : compiled.suffix;
    if (compiled.glob) {
      return globToRegExp(suffix, fold).test(rel);
    }
    // Exact file or prefix directory match for patterns like ~/.ssh/*
    if (suffix.endsWith("/*")) {
      const dir = suffix.slice(0, -2);
      return rel === dir || rel.startsWith(dir + "/");
    }
    return rel === suffix;
  }

  // path kind — match if pattern is a suffix path segment sequence or full glob
  const pat = fold ? compiled.pattern.toLowerCase() : compiled.pattern;
  if (pat.includes("*")) {
    // Try against full path and against a suffix
    if (globToRegExp(pat, fold).test(pathPosix)) return true;
    // Also match when pattern is a relative path suffix (e.g. .docker/config.json)
    if (pathPosix.endsWith("/" + pat.replace(/\*/g, "")) && !pat.includes("*")) {
      return true;
    }
    // Suffix glob: treat as "ends with matched relative"
    const parts = pathPosix.split("/");
    for (let i = 0; i < parts.length; i += 1) {
      const suffix = parts.slice(i).join("/");
      if (globToRegExp(pat, fold).test(suffix)) return true;
    }
    return false;
  }
  return pathPosix === pat || pathPosix.endsWith("/" + pat);
}

export type SecretBlocklist = {
  readonly patterns: SecretPatterns;
  check: (resolvedPath: string) => SecretBlocklistVerdict;
};

export function createSecretBlocklist(
  options: SecretBlocklistOptions = {},
): SecretBlocklist {
  const patterns = options.patterns ?? loadSecurityPatterns(options.defaultsPath);
  const home = options.homeDir ?? homedir();
  const fold = options.caseInsensitive ?? defaultCaseInsensitive();

  const blocked = patterns.blockedFiles.map(compilePattern);
  const allowed = patterns.allowedFiles.map(compilePattern);

  function isAllowed(resolvedPath: string): boolean {
    return allowed.some((p) => matchesCompiled(resolvedPath, p, home, fold));
  }

  function isBlocked(resolvedPath: string): boolean {
    return blocked.some((p) => matchesCompiled(resolvedPath, p, home, fold));
  }

  function check(resolvedPath: string): SecretBlocklistVerdict {
    // allowedFiles exceptions win over blockedFiles.
    if (isAllowed(resolvedPath)) {
      return { blocked: false };
    }
    if (isBlocked(resolvedPath)) {
      return {
        blocked: true,
        code: ERROR_CODES.PATH_BLOCKED,
        reason: "secret-blocklist",
      };
    }
    return { blocked: false };
  }

  return { patterns, check };
}

export function blocklistDenialCode(): ErrorCode {
  return ERROR_CODES.PATH_BLOCKED;
}

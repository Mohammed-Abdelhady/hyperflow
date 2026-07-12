/**
 * Path jail — realpath resolve + symlink-escape deny (layer c).
 * Jail root is realpathed once at construction; per-request checks compare
 * against that canonical root. Denials map to NOT_FOUND with no path echo.
 */
import { realpathSync, statSync, lstatSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { homedir, platform } from "node:os";
import { ERROR_CODES, type ErrorCode } from "@shared/schemas/api.js";

export type PathJailDenial = {
  ok: false;
  code: typeof ERROR_CODES.NOT_FOUND;
  /** Stable machine reason — never the candidate path. */
  reason: string;
};

export type PathJailSuccess = {
  ok: true;
  /** Absolute realpathed filesystem path. */
  resolvedPath: string;
  /** True when the path is the sanctioned global config (may be out-of-jail). */
  isGlobalConfig: boolean;
};

export type PathJailResult = PathJailSuccess | PathJailDenial;

export type PathJailOptions = {
  /** Project `.hyperflow/` root — realpathed once here. */
  jailRoot: string;
  /**
   * Explicit out-of-jail allow target (default: ~/.hyperflow/config.json).
   * Realpathed when the file exists; otherwise normalized absolute path.
   */
  globalConfigPath?: string | undefined;
  /** Override for tests (default: os.homedir()). */
  homeDir?: string | undefined;
  /** Force case folding (default: darwin/win32). */
  caseInsensitive?: boolean | undefined;
};

const DENY = (reason: string): PathJailDenial => ({
  ok: false,
  code: ERROR_CODES.NOT_FOUND,
  reason,
});

/** Segment-aware containment: `/root` does not admit `/root-evil`. */
export function isPathInside(child: string, parent: string, foldCase: boolean): boolean {
  const c = foldCase ? child.toLowerCase() : child;
  const p = foldCase ? parent.toLowerCase() : parent;
  if (c === p) return true;
  const prefix = p.endsWith(sep) ? p : p + sep;
  return c.startsWith(prefix);
}

/** Normalize to platform path with forward-slash variants collapsed. */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function defaultCaseInsensitive(): boolean {
  return platform() === "darwin" || platform() === "win32";
}

/**
 * Decode once. Reject null bytes, residual encoded path metacharacters,
 * and inputs that still change under a second decode (double-encoding).
 */
export function decodeCandidate(candidate: string):
  | { ok: true; value: string }
  | { ok: false; reason: string } {
  if (candidate.includes("\0")) {
    return { ok: false, reason: "null-byte" };
  }

  let once: string;
  try {
    once = decodeURIComponent(candidate);
  } catch {
    return { ok: false, reason: "malformed-encoding" };
  }

  // Residual percent-encodings of path metacharacters after one decode.
  if (/%(?:2e|2f|5c|00)/i.test(once)) {
    return { ok: false, reason: "encoded-traversal" };
  }

  // Double-encoding: second decode still changes the string and is not identical.
  let twice: string;
  try {
    twice = decodeURIComponent(once);
  } catch {
    twice = once;
  }
  if (twice !== once) {
    return { ok: false, reason: "double-encoding" };
  }

  return { ok: true, value: once };
}

function realpathExisting(abs: string): string | null {
  try {
    return realpathSync(abs);
  } catch {
    return null;
  }
}

/**
 * Resolve a candidate that may not exist yet: realpath the nearest existing
 * ancestor, then rejoin the remaining segments (symlink-safe for parents).
 */
function resolvePossiblyNew(absCandidate: string): string | null {
  if (existsSync(absCandidate)) {
    // If it's a symlink, realpath follows it (escape caught by prefix check).
    return realpathExisting(absCandidate);
  }

  let dir = dirname(absCandidate);
  const tail: string[] = [absCandidate.slice(dir.length).replace(/^[/\\]/, "")];
  while (dir !== dirname(dir)) {
    if (existsSync(dir)) {
      const realDir = realpathExisting(dir);
      if (realDir === null) return null;
      const base = tail.filter((s) => s.length > 0).reverse();
      return join(realDir, ...base);
    }
    const parent = dirname(dir);
    const segment = dir.slice(parent.length).replace(/^[/\\]/, "");
    if (segment) tail.push(segment);
    dir = parent;
  }
  return null;
}

export type PathJail = {
  readonly jailRoot: string;
  readonly globalConfigPath: string;
  readonly caseInsensitive: boolean;
  resolveAndVerify: (candidate: string) => PathJailResult;
};

export function createPathJail(options: PathJailOptions): PathJail {
  const fold = options.caseInsensitive ?? defaultCaseInsensitive();
  const home = options.homeDir ?? homedir();

  let jailRoot: string;
  try {
    jailRoot = realpathSync(options.jailRoot);
  } catch {
    // Construction requires an existing jail root.
    throw new Error("jail-root-unresolvable");
  }

  const defaultConfig = join(home, ".hyperflow", "config.json");
  const configCandidate = options.globalConfigPath ?? defaultConfig;
  const globalConfigPath =
    realpathExisting(configCandidate) ?? resolve(configCandidate);

  function resolveAndVerify(candidate: string): PathJailResult {
    const decoded = decodeCandidate(candidate);
    if (!decoded.ok) return DENY(decoded.reason);

    // Normalize separators (Windows-shaped input → POSIX segments).
    const normalized = toPosixPath(decoded.value);
    if (normalized.includes("\0")) return DENY("null-byte");

    // Reject `..` path segments after separator normalization (covers ..\..\ form).
    const segments = normalized.split("/").filter((s) => s.length > 0);
    if (segments.some((s) => s === "..")) {
      // Still resolve + prefix-check absolute candidates that legitimately
      // use `..` only if the final realpath stays inside — but encoded/relative
      // `..` attack shapes are denied up front when they appear as segments.
      // Absolute paths with `..` that stay inside jail are allowed via realpath.
      if (!isAbsolute(decoded.value) && !isAbsolute(normalized)) {
        // Relative `..` escapes are always denied at the segment layer;
        // realpath would also catch them, but this defeats non-existing targets.
        const absProbe = resolve(jailRoot, normalized);
        const resolvedProbe = resolvePossiblyNew(absProbe);
        if (resolvedProbe === null) return DENY("unresolvable");
        if (!isPathInside(resolvedProbe, jailRoot, fold)) {
          return DENY("outside-jail");
        }
        // in-jail after realpath with relative `..` is fine (e.g. sub/../file)
      }
    }

    // Build absolute candidate using slash-normalized form so `\` cannot hide `..`.
    const forResolve = normalized;
    const abs = isAbsolute(forResolve)
      ? resolve(forResolve)
      : resolve(jailRoot, forResolve);

    const resolved = resolvePossiblyNew(abs);
    if (resolved === null) return DENY("unresolvable");

    // Symlink escape / prefix checks on the RESOLVED path.
    if (isPathInside(resolved, jailRoot, fold)) {
      return { ok: true, resolvedPath: resolved, isGlobalConfig: false };
    }

    if (
      fold
        ? resolved.toLowerCase() === globalConfigPath.toLowerCase()
        : resolved === globalConfigPath
    ) {
      return { ok: true, resolvedPath: resolved, isGlobalConfig: true };
    }

    // Also allow when config does not exist yet but resolves to the same path.
    const configNorm = resolve(globalConfigPath);
    if (
      fold
        ? resolved.toLowerCase() === configNorm.toLowerCase()
        : resolved === configNorm
    ) {
      return { ok: true, resolvedPath: resolved, isGlobalConfig: true };
    }

    return DENY("outside-jail");
  }

  return {
    jailRoot,
    globalConfigPath,
    caseInsensitive: fold,
    resolveAndVerify,
  };
}

/** Map a jail denial to the shared error code (always NOT_FOUND). */
export function jailDenialCode(_denial: PathJailDenial): ErrorCode {
  return ERROR_CODES.NOT_FOUND;
}

/** True when the path is a symlink (lstat); used by tests/helpers. */
export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Stat helper without throwing. */
export function tryStat(path: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

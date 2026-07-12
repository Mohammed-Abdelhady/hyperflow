/**
 * Write denylist — closed write-surface enumeration (layer e helper).
 * Deny is the default; only explicit allowlist entries may be written.
 * Operates on RESOLVED absolute paths (caller runs path-jail first).
 */
import { basename, relative, sep } from "node:path";
import { platform } from "node:os";

export type DenylistContext = {
  /** Canonical realpathed `.hyperflow/` jail root. */
  jailRoot: string;
  /** Absolute path of the sanctioned global config. */
  globalConfigPath: string;
  /** Absolute path of `.hyperflow-handoff/` sibling (optional). */
  handoffRoot?: string | undefined;
  caseInsensitive?: boolean | undefined;
};

export type DenylistVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

function foldEnabled(ctx: DenylistContext): boolean {
  return (
    ctx.caseInsensitive ??
    (platform() === "darwin" || platform() === "win32")
  );
}

function norm(p: string, fold: boolean): string {
  const posix = p.replace(/\\/g, "/");
  return fold ? posix.toLowerCase() : posix;
}

function jailRelative(resolvedPath: string, ctx: DenylistContext): string | null {
  const fold = foldEnabled(ctx);
  const root = norm(ctx.jailRoot, fold);
  const target = norm(resolvedPath, fold);
  if (target === root) return "";
  const prefix = root.endsWith("/") ? root : root + "/";
  if (!target.startsWith(prefix)) return null;
  return target.slice(prefix.length);
}

function samePath(a: string, b: string, fold: boolean): boolean {
  return norm(a, fold) === norm(b, fold);
}

/** Derived artefacts — hard read-only via the write door. */
const DERIVED_RELATIVE = new Set(["memory/index.md", "memory/.checksums"]);

/** Roster / plan files that the dashboard must never write. */
const ROSTER_BASENAMES = new Set(["phase.md", "feature.md"]);

/**
 * Relative POSIX path matches a task-file class:
 * - tasks/<slug>
 * - features/<slug>/tasks/...
 * - features/<slug>/<phase>/tasks/...
 * - any deeper tasks segment under features/
 */
export function isTaskFileRelative(relPosix: string): boolean {
  const p = relPosix.replace(/\\/g, "/").replace(/^\/+/, "");
  if (p === "tasks" || p.startsWith("tasks/")) return true;
  // features/<slug>/tasks/... OR features/<slug>/<phase>/tasks/...
  if (/^features\/[^/]+\/tasks(\/|$)/.test(p)) return true;
  if (/^features\/[^/]+\/[^/]+\/tasks(\/|$)/.test(p)) return true;
  // Broader: any path segment `tasks` under features/
  if (p.startsWith("features/") && /(?:^|\/)tasks(?:\/|$)/.test(p)) {
    return true;
  }
  return false;
}

function isRosterFile(relPosix: string): boolean {
  const base = basename(relPosix.replace(/\\/g, "/")).toLowerCase();
  return ROSTER_BASENAMES.has(base);
}

function isDerivedRelative(relPosix: string): boolean {
  const p = relPosix.replace(/\\/g, "/").toLowerCase();
  return DERIVED_RELATIVE.has(p);
}

/**
 * Memory category files under memory/ excluding derived index/checksums.
 * Allow: memory/decisions.md, memory/foo.md, memory/nested/x.md
 */
function isMemoryCategoryFile(relPosix: string): boolean {
  const p = relPosix.replace(/\\/g, "/");
  const lower = p.toLowerCase();
  if (!lower.startsWith("memory/")) return false;
  if (isDerivedRelative(lower)) return false;
  // Must be a file path (has something after memory/)
  return lower.length > "memory/".length;
}

/** Project markers at jail root. */
function isMarkerFile(relPosix: string): boolean {
  const p = relPosix.replace(/\\/g, "/").toLowerCase();
  return p === ".mode" || p === ".sticky";
}

/**
 * Handoff STATUS files: either under handoffRoot or jail-relative handoff paths.
 * Convention: `<handoffRoot>/<slug>/STATUS` or `STATUS` file basename under handoff tree.
 */
function isHandoffStatus(
  resolvedPath: string,
  ctx: DenylistContext,
  fold: boolean,
): boolean {
  const base = basename(resolvedPath);
  if (fold ? base.toLowerCase() !== "status" : base !== "STATUS") {
    // Accept both STATUS and status via fold on case-insensitive FS;
    // on case-sensitive FS require exact STATUS.
    if (base !== "STATUS" && base.toLowerCase() !== "status") return false;
    if (!fold && base !== "STATUS") return false;
  }

  if (ctx.handoffRoot) {
    const root = norm(ctx.handoffRoot, fold);
    const target = norm(resolvedPath, fold);
    const prefix = root.endsWith("/") ? root : root + "/";
    if (target.startsWith(prefix) || target === root) return true;
  }

  // Also allow jail-relative handoff/STATUS patterns if present inside jail
  const rel = jailRelative(resolvedPath, ctx);
  if (rel !== null) {
    const r = rel.replace(/\\/g, "/").toLowerCase();
    if (r === "status" || /(^|\/)status$/.test(r)) {
      // Only under a handoff-like prefix when inside jail
      if (r.includes("handoff") || r === "status") return true;
    }
  }
  return false;
}

/**
 * Pure write-allow predicate over a resolved absolute path.
 * Default deny; allowlist is the only path to yes.
 */
export function mayWrite(
  resolvedPath: string,
  ctx: DenylistContext,
): DenylistVerdict {
  const fold = foldEnabled(ctx);

  // Global config is always an allowlisted write target.
  if (samePath(resolvedPath, ctx.globalConfigPath, fold)) {
    return { allowed: true };
  }

  // Handoff STATUS (may live outside jail in .hyperflow-handoff/)
  if (isHandoffStatus(resolvedPath, ctx, fold)) {
    return { allowed: true };
  }

  const rel = jailRelative(resolvedPath, ctx);
  if (rel === null) {
    return { allowed: false, reason: "outside-write-surface" };
  }

  const relPosix = rel.split(sep).join("/");

  if (isDerivedRelative(relPosix)) {
    return { allowed: false, reason: "derived-file" };
  }
  if (isTaskFileRelative(relPosix)) {
    return { allowed: false, reason: "task-file" };
  }
  if (isRosterFile(relPosix)) {
    return { allowed: false, reason: "roster-file" };
  }
  if (isMarkerFile(relPosix)) {
    return { allowed: true };
  }
  if (isMemoryCategoryFile(relPosix)) {
    return { allowed: true };
  }

  return { allowed: false, reason: "not-in-allowlist" };
}

/** Convenience: relative path helper for tests. */
export function relativeToJail(
  resolvedPath: string,
  jailRoot: string,
): string {
  return relative(jailRoot, resolvedPath).split(sep).join("/");
}

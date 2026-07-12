/**
 * Walk-up `.hyperflow/` root discovery.
 */
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type DiscoveryResult =
  | { found: true; rootDir: string; hyperflowDir: string }
  | { found: false; cwd: string };

/**
 * Walk from cwd toward filesystem root until a directory containing
 * `.hyperflow/` is found. Explicit root overrides the walk.
 */
export function discoverProjectRoot(
  cwd: string,
  explicitRoot?: string | undefined,
): DiscoveryResult {
  if (explicitRoot !== undefined && explicitRoot.length > 0) {
    const abs = resolve(explicitRoot);
    const real = safeRealpath(abs) ?? abs;
    const hyperflowDir = join(real, ".hyperflow");
    if (existsSync(hyperflowDir) && isDir(hyperflowDir)) {
      return { found: true, rootDir: real, hyperflowDir };
    }
    // Explicit root still used even without .hyperflow (guided empty state).
    return { found: false, cwd: real };
  }

  let dir = safeRealpath(cwd) ?? resolve(cwd);
  const seen = new Set<string>();

  while (!seen.has(dir)) {
    seen.add(dir);
    const hyperflowDir = join(dir, ".hyperflow");
    if (existsSync(hyperflowDir) && isDir(hyperflowDir)) {
      return { found: true, rootDir: dir, hyperflowDir };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return { found: false, cwd: safeRealpath(cwd) ?? resolve(cwd) };
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

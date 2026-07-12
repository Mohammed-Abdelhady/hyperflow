/**
 * Shared read-only fs helpers for snapshot / events services.
 * Write APIs are banned here by eslint; only reads.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  type Dirent,
} from "node:fs";
import { join, relative, sep } from "node:path";

export type FileStat = {
  mtimeMs: number;
  size: number;
};

export function pathExists(abs: string): boolean {
  return existsSync(abs);
}

export function readText(abs: string): string | null {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

export function readBuffer(abs: string): Buffer | null {
  try {
    return readFileSync(abs);
  } catch {
    return null;
  }
}

export function readStat(abs: string): FileStat | null {
  try {
    const s = statSync(abs);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

export function listDir(abs: string): Dirent[] {
  try {
    return readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Walk files under root; returns absolute paths. */
export function walkFiles(
  root: string,
  opts: { extensions?: readonly string[]; maxDepth?: number } = {},
): string[] {
  const out: string[] = [];
  const maxDepth = opts.maxDepth ?? 12;
  const exts = opts.extensions;

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    for (const ent of listDir(dir)) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        walk(abs, depth + 1);
      } else if (ent.isFile()) {
        if (exts && !exts.some((e) => ent.name.endsWith(e))) continue;
        out.push(abs);
      }
    }
  }

  if (pathExists(root)) walk(root, 0);
  return out;
}

export function toPosixRel(from: string, abs: string): string {
  return relative(from, abs).split(sep).join("/");
}

export function joinRoot(...parts: string[]): string {
  return join(...parts);
}

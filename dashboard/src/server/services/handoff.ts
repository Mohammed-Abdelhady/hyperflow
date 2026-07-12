/**
 * Handoff service — package reads + STATUS forward-only state machine.
 */
import type { HandoffEntry, HandoffStatus } from "@shared/schemas/snapshot-ops.js";
import { parseHandoff } from "../parser/handoff.js";
import { isRawFallback } from "../parser/primitives/fallback.js";
import type { WriteDoor, WriteResult } from "./write.js";
import {
  IllegalTransitionError,
  NotFoundError,
  PathBlockedError,
  WriteConflictError,
  ObserveModeError,
  ValidationError,
} from "./errors.js";
import {
  joinRoot,
  listDir,
  pathExists,
  readStat,
  readText,
} from "./fs-read.js";

const LEGAL: ReadonlyMap<HandoffStatus, HandoffStatus> = new Map([
  ["planned", "built"],
  ["built", "reviewed"],
]);

export type HandoffServiceOptions = {
  handoffDir: string;
  writeDoor: WriteDoor;
};

export type HandoffTransitionInput = {
  slug: string;
  status: "planned" | "built" | "reviewed";
  writeId?: string | undefined;
  expectedMtimeMs?: number | undefined;
};

export type HandoffService = {
  list: () => HandoffEntry[];
  read: (slug: string) => HandoffEntry;
  transition: (input: HandoffTransitionInput) => Promise<WriteResult>;
};

function mapWriteFailure(result: WriteResult): never {
  if (result.ok) throw new Error("unreachable");
  if (result.code === "OBSERVE_MODE") throw new ObserveModeError(result.reason);
  if (result.code === "WRITE_CONFLICT") {
    throw new WriteConflictError(result.reason, result.details);
  }
  if (result.code === "PATH_BLOCKED") {
    throw new PathBlockedError(result.reason, result.details);
  }
  if (result.code === "NOT_FOUND") {
    throw new NotFoundError(result.reason, result.details);
  }
  throw new ValidationError(result.reason, result.details);
}

function assertSlug(slug: string): void {
  if (!slug || slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new ValidationError("invalid handoff slug", { slug });
  }
}

export function createHandoffService(
  options: HandoffServiceOptions,
): HandoffService {
  const { handoffDir, writeDoor } = options;

  function readPackageFiles(slug: string): Record<string, string> {
    const root = joinRoot(handoffDir, slug);
    const files: Record<string, string> = {};
    for (const name of ["HANDOFF.md", "STATUS", "COMPLETION.md"] as const) {
      const raw = readText(joinRoot(root, name));
      if (raw !== null) files[name] = raw;
    }
    return files;
  }

  function read(slug: string): HandoffEntry {
    assertSlug(slug);
    const root = joinRoot(handoffDir, slug);
    if (!pathExists(root)) throw new NotFoundError("handoff package not found");
    const files = readPackageFiles(slug);
    const st = readStat(root);
    const opts: Parameters<typeof parseHandoff>[0] = {
      path: slug,
      slug,
      files,
    };
    if (st) opts.mtimeMs = st.mtimeMs;
    return parseHandoff(opts);
  }

  function list(): HandoffEntry[] {
    const out: HandoffEntry[] = [];
    if (!pathExists(handoffDir)) return out;
    for (const ent of listDir(handoffDir)) {
      if (!ent.isDirectory()) continue;
      try {
        out.push(read(ent.name));
      } catch {
        /* skip */
      }
    }
    return out;
  }

  async function transition(
    input: HandoffTransitionInput,
  ): Promise<WriteResult> {
    assertSlug(input.slug);
    const pkg = read(input.slug);
    if (isRawFallback(pkg)) {
      throw new ValidationError("cannot transition unparsed handoff package");
    }

    const current = pkg.status;
    const requested = input.status;

    // State machine: planned → built → reviewed only; same-state rejected.
    if (current === "unknown") {
      throw new IllegalTransitionError(current, requested);
    }
    const allowed = LEGAL.get(current);
    if (allowed !== requested) {
      throw new IllegalTransitionError(current, requested);
    }

    // Only after legal check do we write (no backup on reject).
    const statusPath = joinRoot(handoffDir, input.slug, "STATUS");
    const st = readStat(statusPath);
    const req: Parameters<WriteDoor["writeFile"]>[0] = {
      path: statusPath,
      contents: `${requested}\n`,
    };
    if (input.writeId !== undefined) req.writeId = input.writeId;
    if (input.expectedMtimeMs !== undefined) {
      req.expectedMtimeMs = input.expectedMtimeMs;
    } else if (st) {
      req.expectedMtimeMs = st.mtimeMs;
    }

    const result = await writeDoor.writeFile(req);
    if (!result.ok) mapWriteFailure(result);
    return result;
  }

  return { list, read, transition };
}

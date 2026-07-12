/**
 * Restore-from-backup service — reinstates via the conflict-checked write door.
 */
import type { WriteDoor, WriteResult } from "./write.js";
import {
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
  toPosixRel,
} from "./fs-read.js";

export type BackupInfo = {
  id: string;
  path: string;
  targetRel: string;
  mtimeMs?: number | undefined;
};

export type RestoreServiceOptions = {
  jailRoot: string;
  backupRoot?: string | undefined;
  writeDoor: WriteDoor;
};

export type RestoreInput = {
  backupId: string;
  /** Absolute or jail-relative target path currently on disk. */
  targetPath: string;
  expectedMtimeMs?: number | undefined;
  expectedContentHash?: string | undefined;
  writeId?: string | undefined;
};

export type RestoreService = {
  listBackups: (targetPath?: string) => BackupInfo[];
  restore: (input: RestoreInput) => Promise<WriteResult>;
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

/**
 * Write-door backup names: `<rel-with-__>.<stamp>.bak`
 * where rel uses `__` for path separators.
 */
function parseBackupName(name: string): { targetRel: string } | null {
  if (!name.endsWith(".bak")) return null;
  const without = name.slice(0, -".bak".length);
  // stamp is ISO-like with hyphens; split from the right at the last segment pattern
  const m = without.match(/^(.*)\.(\d{4}-\d{2}-\d{2}T.+)$/);
  if (!m?.[1]) return null;
  const targetRel = m[1].split("__").join("/");
  return { targetRel };
}

export function createRestoreService(
  options: RestoreServiceOptions,
): RestoreService {
  const backupRoot =
    options.backupRoot ?? joinRoot(options.jailRoot, ".bak");
  const { writeDoor, jailRoot } = options;

  function listBackups(targetPath?: string): BackupInfo[] {
    if (!pathExists(backupRoot)) return [];
    const filterRel = targetPath
      ? targetPath.startsWith(jailRoot)
        ? toPosixRel(jailRoot, targetPath)
        : targetPath.replace(/\\/g, "/")
      : null;

    const out: BackupInfo[] = [];
    for (const ent of listDir(backupRoot)) {
      if (!ent.isFile()) continue;
      const parsed = parseBackupName(ent.name);
      if (!parsed) continue;
      if (filterRel && parsed.targetRel !== filterRel) continue;
      const abs = joinRoot(backupRoot, ent.name);
      const st = readStat(abs);
      const info: BackupInfo = {
        id: ent.name,
        path: abs,
        targetRel: parsed.targetRel,
      };
      if (st) info.mtimeMs = st.mtimeMs;
      out.push(info);
    }
    return out.sort((a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0));
  }

  async function restore(input: RestoreInput): Promise<WriteResult> {
    const backupAbs = joinRoot(backupRoot, input.backupId);
    if (!pathExists(backupAbs)) {
      throw new NotFoundError("backup not found", { backupId: input.backupId });
    }
    const contents = readText(backupAbs);
    if (contents === null) {
      throw new NotFoundError("backup unreadable");
    }

    const targetAbs = input.targetPath.startsWith(jailRoot)
      ? input.targetPath
      : joinRoot(jailRoot, input.targetPath);

    const req: Parameters<WriteDoor["writeFile"]>[0] = {
      path: targetAbs,
      contents,
    };
    if (input.expectedMtimeMs !== undefined) {
      req.expectedMtimeMs = input.expectedMtimeMs;
    }
    if (input.expectedContentHash !== undefined) {
      req.expectedContentHash = input.expectedContentHash;
    }
    if (input.writeId !== undefined) req.writeId = input.writeId;

    const result = await writeDoor.writeFile(req);
    if (!result.ok) mapWriteFailure(result);
    return result;
  }

  return { listBackups, restore };
}

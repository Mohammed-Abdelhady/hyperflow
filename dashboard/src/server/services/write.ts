/** Single write door: jail → denylist/blocklist → backup → temp+fsync → rename. */
import {
  accessSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, basename, relative, sep } from "node:path";
import { ERROR_CODES, type ErrorCode } from "@shared/schemas/api.js";
import { createPathJail, type PathJail } from "../security/path-jail.js";
import { mayWrite, type DenylistContext } from "../security/denylist.js";
import {
  createSecretBlocklist,
  type SecretBlocklist,
} from "../security/secret-blocklist.js";
import { preserveTextForm } from "./write-text.js";

export type { preserveTextForm } from "./write-text.js";

export type WriteStage =
  | "jail"
  | "denylist"
  | "blocklist"
  | "conflict"
  | "backup"
  | "temp-write"
  | "rename"
  | "observe-short-circuit";

export type WriteRequest = {
  path: string;
  contents: string;
  expectedMtimeMs?: number | undefined;
  expectedContentHash?: string | undefined;
  writeId?: string | undefined;
};

export type WriteSuccess = {
  ok: true;
  writeId: string;
  resolvedPath: string;
  mtimeMs: number;
  contentHash: string;
  backupPath?: string | undefined;
};

export type WriteFailure = {
  ok: false;
  code: ErrorCode | "OBSERVE_MODE";
  reason: string;
  details?: unknown;
};

export type WriteResult = WriteSuccess | WriteFailure;

export type WriteDoorOptions = {
  jailRoot: string;
  globalConfigPath: string;
  handoffRoot?: string | undefined;
  backupRoot?: string | undefined;
  homeDir?: string | undefined;
  caseInsensitive?: boolean | undefined;
  onStage?: ((stage: WriteStage) => void) | undefined;
  pathJail?: PathJail | undefined;
  secretBlocklist?: SecretBlocklist | undefined;
};

export type WriteDoor = {
  writeFile: (request: WriteRequest) => Promise<WriteResult>;
  isObserveMode: () => boolean;
  probeWritability: () => boolean;
  setObserveMode: (value: boolean) => void;
};

function contentHash(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function isRoError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM";
}

function fsyncPath(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function createWriteDoor(options: WriteDoorOptions): WriteDoor {
  let observeMode = false;
  const stage = (s: WriteStage) => options.onStage?.(s);

  const jail =
    options.pathJail ??
    createPathJail({
      jailRoot: options.jailRoot,
      globalConfigPath: options.globalConfigPath,
      handoffRoot: options.handoffRoot,
      homeDir: options.homeDir,
      caseInsensitive: options.caseInsensitive,
    });

  const blocklist =
    options.secretBlocklist ??
    createSecretBlocklist({
      homeDir: options.homeDir,
      caseInsensitive: options.caseInsensitive,
    });

  const backupRoot = options.backupRoot ?? join(jail.jailRoot, ".bak");
  const denylistCtx: DenylistContext = {
    jailRoot: jail.jailRoot,
    globalConfigPath: jail.globalConfigPath,
    // Prefer jail-canonical handoff root so realpath (/var vs /private/var) matches.
    handoffRoot: jail.handoffRoot ?? options.handoffRoot,
    caseInsensitive: options.caseInsensitive ?? jail.caseInsensitive,
  };

  function probeWritability(): boolean {
    try {
      accessSync(jail.jailRoot, fsConstants.W_OK);
      observeMode = false;
      return true;
    } catch {
      observeMode = true;
      return false;
    }
  }

  async function writeFile(request: WriteRequest): Promise<WriteResult> {
    if (observeMode) {
      stage("observe-short-circuit");
      return { ok: false, code: "OBSERVE_MODE", reason: "filesystem-read-only" };
    }

    stage("jail");
    const jailed = jail.resolveAndVerify(request.path);
    if (!jailed.ok) {
      return { ok: false, code: ERROR_CODES.NOT_FOUND, reason: jailed.reason };
    }
    const resolvedPath = jailed.resolvedPath;

    stage("denylist");
    const deny = mayWrite(resolvedPath, denylistCtx);
    if (!deny.allowed) {
      return { ok: false, code: ERROR_CODES.PATH_BLOCKED, reason: deny.reason };
    }

    stage("blocklist");
    const blocked = blocklist.check(resolvedPath);
    if (blocked.blocked) {
      return {
        ok: false,
        code: ERROR_CODES.PATH_BLOCKED,
        reason: blocked.reason,
      };
    }

    const exists = existsSync(resolvedPath);
    let prior: Buffer | null = null;
    let priorStat: { mtimeMs: number } | null = null;

    if (exists) {
      try {
        prior = readFileSync(resolvedPath);
        priorStat = statSync(resolvedPath);
      } catch (err) {
        if (isRoError(err)) {
          observeMode = true;
          return {
            ok: false,
            code: "OBSERVE_MODE",
            reason: "filesystem-read-only",
          };
        }
        return { ok: false, code: ERROR_CODES.NOT_FOUND, reason: "unreadable" };
      }

      stage("conflict");
      if (
        request.expectedMtimeMs !== undefined ||
        request.expectedContentHash !== undefined
      ) {
        const currentHash = contentHash(prior);
        const mtimeMismatch =
          request.expectedMtimeMs !== undefined &&
          priorStat.mtimeMs !== request.expectedMtimeMs;
        const hashMismatch =
          request.expectedContentHash !== undefined &&
          currentHash !== request.expectedContentHash;
        if (mtimeMismatch || hashMismatch) {
          return {
            ok: false,
            code: ERROR_CODES.WRITE_CONFLICT,
            reason: "mtime-or-hash-mismatch",
            details: { mtimeMs: priorStat.mtimeMs, contentHash: currentHash },
          };
        }
      }
    } else {
      stage("conflict");
    }

    const bytes = preserveTextForm(request.contents, prior);
    const writeId = request.writeId ?? randomBytes(8).toString("hex");
    let backupPath: string | undefined;

    try {
      if (exists && prior) {
        stage("backup");
        const rel = relative(jail.jailRoot, resolvedPath).split(sep).join("__");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        mkdirSync(backupRoot, { recursive: true });
        backupPath = join(
          backupRoot,
          `${rel || basename(resolvedPath)}.${stamp}.bak`,
        );
        copyFileSync(resolvedPath, backupPath);
      }

      stage("temp-write");
      const dir = dirname(resolvedPath);
      mkdirSync(dir, { recursive: true });
      const tempPath = join(
        dir,
        `.${basename(resolvedPath)}.${randomBytes(4).toString("hex")}.tmp`,
      );
      writeFileSync(tempPath, bytes);
      fsyncPath(tempPath);
      try {
        fsyncPath(dir);
      } catch {
        /* directory fsync unsupported — best effort */
      }

      stage("rename");
      renameSync(tempPath, resolvedPath);
      const st = statSync(resolvedPath);
      return {
        ok: true,
        writeId,
        resolvedPath,
        mtimeMs: st.mtimeMs,
        contentHash: contentHash(bytes),
        backupPath,
      };
    } catch (err) {
      if (isRoError(err)) {
        observeMode = true;
        return {
          ok: false,
          code: "OBSERVE_MODE",
          reason: "filesystem-read-only",
        };
      }
      return {
        ok: false,
        code: ERROR_CODES.INTERNAL,
        reason: err instanceof Error ? err.message : "write-failed",
      };
    }
  }

  return {
    writeFile,
    isObserveMode: () => observeMode,
    probeWritability,
    setObserveMode: (v) => {
      observeMode = v;
    },
  };
}

let defaultDoor: WriteDoor | null = null;

export function configureWriteDoor(options: WriteDoorOptions): WriteDoor {
  defaultDoor = createWriteDoor(options);
  return defaultDoor;
}

export async function writeFile(request: WriteRequest): Promise<WriteResult> {
  if (!defaultDoor) {
    throw new Error("write door not configured — call configureWriteDoor first");
  }
  return defaultDoor.writeFile(request);
}

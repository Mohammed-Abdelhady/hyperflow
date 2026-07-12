/**
 * Config domain service — drift-tolerant read, schema-checked write.
 */
import {
  parseConfigRead,
  parseConfigWrite,
  type ConfigReadResult,
  type ConfigWrite,
  CONFIG_ROOT_KEY_SET,
} from "@shared/schemas/config.js";
import type { WriteDoor, WriteResult } from "./write.js";
import {
  NotFoundError,
  PathBlockedError,
  WriteConflictError,
  ObserveModeError,
  ValidationError,
} from "./errors.js";
import { pathExists, readStat, readText } from "./fs-read.js";

export type ConfigServiceOptions = {
  globalConfigPath: string;
  writeDoor: WriteDoor;
};

export type ConfigWriteInput = {
  config: ConfigWrite;
  /** Unrecognized keys to preserve (from a prior read). */
  unrecognized?: Record<string, unknown> | undefined;
  expectedMtimeMs?: number | undefined;
  expectedContentHash?: string | undefined;
  writeId?: string | undefined;
};

export type ConfigService = {
  read: () => ConfigReadResult & { mtimeMs?: number; present: boolean };
  write: (input: ConfigWriteInput) => Promise<WriteResult>;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createConfigService(
  options: ConfigServiceOptions,
): ConfigService {
  const { globalConfigPath, writeDoor } = options;

  function read(): ConfigReadResult & { mtimeMs?: number; present: boolean } {
    if (!pathExists(globalConfigPath)) {
      return {
        config: {},
        unrecognized: {},
        unrecognizedKeys: [],
        present: false,
      };
    }
    const raw = readText(globalConfigPath);
    const st = readStat(globalConfigPath);
    if (raw === null || raw.trim() === "") {
      return {
        config: {},
        unrecognized: {},
        unrecognizedKeys: [],
        present: true,
        ...(st ? { mtimeMs: st.mtimeMs } : {}),
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new ValidationError("config.json is not valid JSON", {
        issue: err instanceof Error ? err.message : "parse-error",
      });
    }
    const parsed = parseConfigRead(json);
    if (!parsed.success) {
      throw new ValidationError("config.json failed schema validation", {
        issues: parsed.error.flatten(),
      });
    }
    return {
      ...parsed.data,
      present: true,
      ...(st ? { mtimeMs: st.mtimeMs } : {}),
    };
  }

  async function write(input: ConfigWriteInput): Promise<WriteResult> {
    const checked = parseConfigWrite(input.config);
    if (!checked.success) {
      throw new ValidationError("config write payload invalid", {
        issues: checked.error.flatten(),
      });
    }

    // Merge unrecognized keys from input or current disk (preserve drift).
    let unrecognized = input.unrecognized ?? {};
    if (Object.keys(unrecognized).length === 0 && pathExists(globalConfigPath)) {
      const raw = readText(globalConfigPath);
      if (raw) {
        try {
          const disk: unknown = JSON.parse(raw);
          if (isRecord(disk)) {
            const u: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(disk)) {
              if (!CONFIG_ROOT_KEY_SET.has(k)) u[k] = v;
            }
            unrecognized = u;
          }
        } catch {
          /* ignore — new write replaces */
        }
      }
    }

    // Ensure unrecognized keys are not recognized schema keys
    const cleanUnrecognized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(unrecognized)) {
      if (!CONFIG_ROOT_KEY_SET.has(k)) cleanUnrecognized[k] = v;
    }

    const merged = { ...checked.data, ...cleanUnrecognized };
    const contents = `${JSON.stringify(merged, null, 2)}\n`;

    const req: Parameters<WriteDoor["writeFile"]>[0] = {
      path: globalConfigPath,
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

  return { read, write };
}

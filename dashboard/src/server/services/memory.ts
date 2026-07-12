/**
 * Memory domain service — category file CRUD via the write door.
 * Hard refusal of index.md / .checksums before the door.
 */
import type {
  MemoryCategoryEntry,
  MemoryEntry,
} from "@shared/schemas/snapshot-artefacts.js";
import { parseMemory } from "../parser/memory.js";
import { isRawFallback } from "../parser/primitives/fallback.js";
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

const FORBIDDEN_BASES = new Set(["index", ".checksums"]);

export type MemoryServiceOptions = {
  hyperflowDir: string;
  writeDoor: WriteDoor;
};

export type MemoryWriteInput = {
  category: string;
  content: string;
  expectedMtimeMs?: number | undefined;
  expectedContentHash?: string | undefined;
  writeId?: string | undefined;
};

export type MemoryService = {
  list: () => MemoryCategoryEntry[];
  read: (category: string) => MemoryCategoryEntry;
  writeCategory: (input: MemoryWriteInput) => Promise<WriteResult>;
  createEntry: (
    category: string,
    entryMarkdown: string,
    opts?: { expectedMtimeMs?: number; writeId?: string },
  ) => Promise<WriteResult>;
  deleteEntry: (
    category: string,
    entryId: string,
    opts?: { expectedMtimeMs?: number; writeId?: string },
  ) => Promise<WriteResult>;
};

function assertCategoryAllowed(category: string): void {
  const base = category.replace(/\.md$/i, "");
  if (
    FORBIDDEN_BASES.has(base) ||
    FORBIDDEN_BASES.has(category) ||
    category === "index.md" ||
    category === ".checksums"
  ) {
    throw new PathBlockedError("memory derived file is read-only", {
      category,
      reason: "derived-file",
    });
  }
  if (
    category.includes("..") ||
    category.includes("/") ||
    category.includes("\\")
  ) {
    throw new ValidationError("invalid memory category", { category });
  }
}

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

function serializeEntry(entry: MemoryEntry): string {
  if (entry.class === "tagged" && entry.date) {
    const tags =
      entry.tags.length > 0 ? `  \`[${entry.tags.join(", ")}]\`` : "";
    const lines = [`### [${entry.date}] ${entry.title}${tags}`, ""];
    if (entry.what) lines.push(`**What:** ${entry.what}`, "");
    if (entry.why) lines.push(`**Why it matters:** ${entry.why}`, "");
    if (entry.evidence) lines.push(`**Evidence:** ${entry.evidence}`, "");
    return lines.join("\n").trimEnd() + "\n";
  }
  if (entry.rawBody) return `### ${entry.title}\n\n${entry.rawBody}\n`;
  return `### ${entry.title}\n`;
}

export function createMemoryService(
  options: MemoryServiceOptions,
): MemoryService {
  const { hyperflowDir, writeDoor } = options;
  const memDir = joinRoot(hyperflowDir, "memory");

  function categoryPath(category: string): string {
    assertCategoryAllowed(category);
    const file = category.endsWith(".md") ? category : `${category}.md`;
    return joinRoot(memDir, file);
  }

  function read(category: string): MemoryCategoryEntry {
    const abs = categoryPath(category);
    if (!pathExists(abs)) throw new NotFoundError("memory category not found");
    const raw = readText(abs) ?? "";
    const st = readStat(abs);
    const path = toPosixRel(hyperflowDir, abs);
    const opts: Parameters<typeof parseMemory>[0] = { path, raw };
    if (st) opts.mtimeMs = st.mtimeMs;
    return parseMemory(opts);
  }

  function list(): MemoryCategoryEntry[] {
    const out: MemoryCategoryEntry[] = [];
    for (const ent of listDir(memDir)) {
      if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
      if (ent.name === "index.md") continue;
      try {
        out.push(read(ent.name.replace(/\.md$/i, "")));
      } catch {
        /* skip unreadable */
      }
    }
    return out;
  }

  async function writeCategory(input: MemoryWriteInput): Promise<WriteResult> {
    const abs = categoryPath(input.category);
    const req: Parameters<WriteDoor["writeFile"]>[0] = {
      path: abs,
      contents: input.content,
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

  async function createEntry(
    category: string,
    entryMarkdown: string,
    opts?: { expectedMtimeMs?: number; writeId?: string },
  ): Promise<WriteResult> {
    const abs = categoryPath(category);
    const prior = pathExists(abs) ? (readText(abs) ?? "") : "";
    const st = readStat(abs);
    const sep = prior.endsWith("\n") || prior.length === 0 ? "" : "\n";
    const content = `${prior}${sep}${entryMarkdown.trimEnd()}\n`;
    const input: MemoryWriteInput = { category, content };
    if (opts?.expectedMtimeMs !== undefined) {
      input.expectedMtimeMs = opts.expectedMtimeMs;
    } else if (st) {
      input.expectedMtimeMs = st.mtimeMs;
    }
    if (opts?.writeId !== undefined) input.writeId = opts.writeId;
    return writeCategory(input);
  }

  async function deleteEntry(
    category: string,
    entryId: string,
    opts?: { expectedMtimeMs?: number; writeId?: string },
  ): Promise<WriteResult> {
    const cat = read(category);
    if (isRawFallback(cat)) {
      throw new ValidationError("cannot delete entry from unparsed category");
    }
    const remaining = cat.entries.filter((e) => e.id !== entryId);
    if (remaining.length === cat.entries.length) {
      throw new NotFoundError("memory entry not found", { entryId });
    }
    const content = remaining.map(serializeEntry).join("\n");
    const st = readStat(categoryPath(category));
    const input: MemoryWriteInput = { category, content };
    if (opts?.expectedMtimeMs !== undefined) {
      input.expectedMtimeMs = opts.expectedMtimeMs;
    } else if (st) {
      input.expectedMtimeMs = st.mtimeMs;
    }
    if (opts?.writeId !== undefined) input.writeId = opts.writeId;
    return writeCategory(input);
  }

  return { list, read, writeCategory, createEntry, deleteEntry };
}

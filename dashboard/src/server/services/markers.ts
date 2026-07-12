/**
 * Marker service — read/toggle `.mode` and `.sticky` via write door.
 */
import type { Markers } from "@shared/schemas/snapshot-ops.js";
import type { WriteDoor, WriteResult } from "./write.js";
import {
  NotFoundError,
  PathBlockedError,
  WriteConflictError,
  ObserveModeError,
  ValidationError,
} from "./errors.js";
import { joinRoot, pathExists, readText } from "./fs-read.js";
import { loadMarkers } from "./snapshot-load.js";

export type MarkersServiceOptions = {
  hyperflowDir: string;
  writeDoor: WriteDoor;
};

export type MarkersToggleInput = {
  mode?: string | null | undefined;
  sticky?: boolean | undefined;
  writeId?: string | undefined;
};

export type MarkersService = {
  read: () => Markers;
  toggle: (input: MarkersToggleInput) => Promise<{
    markers: Markers;
    writeIds: string[];
  }>;
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

export function createMarkersService(
  options: MarkersServiceOptions,
): MarkersService {
  const { hyperflowDir, writeDoor } = options;

  function read(): Markers {
    return loadMarkers(hyperflowDir);
  }

  async function toggle(input: MarkersToggleInput): Promise<{
    markers: Markers;
    writeIds: string[];
  }> {
    if (input.mode === undefined && input.sticky === undefined) {
      throw new ValidationError("no marker change requested");
    }
    const writeIds: string[] = [];

    if (input.mode !== undefined) {
      const abs = joinRoot(hyperflowDir, ".mode");
      const contents = input.mode === null ? "" : `${input.mode}\n`;
      const req: Parameters<WriteDoor["writeFile"]>[0] = {
        path: abs,
        contents,
      };
      if (input.writeId !== undefined) req.writeId = `${input.writeId}-mode`;
      const result = await writeDoor.writeFile(req);
      if (!result.ok) mapWriteFailure(result);
      writeIds.push(result.writeId);
    }

    if (input.sticky !== undefined) {
      const abs = joinRoot(hyperflowDir, ".sticky");
      // sticky present = true; empty/absent content for false (file still written)
      const contents = input.sticky ? "1\n" : "";
      const req: Parameters<WriteDoor["writeFile"]>[0] = {
        path: abs,
        contents,
      };
      if (input.writeId !== undefined) req.writeId = `${input.writeId}-sticky`;
      const result = await writeDoor.writeFile(req);
      if (!result.ok) mapWriteFailure(result);
      writeIds.push(result.writeId);
    }

    // loadMarkers treats empty sticky file as sticky:true (length>0 false for empty)
    // Ensure semantics: sticky true means non-empty file; false means empty content.
    // Re-read after write.
    void pathExists;
    void readText;
    return { markers: read(), writeIds };
  }

  return { read, toggle };
}

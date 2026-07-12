/**
 * Single write door for all dashboard filesystem writes.
 * Real implementation lands in phase 3 (T10). This placeholder exists so the
 * lint allowlist path is present from commit one.
 */
import { writeFile as fsWriteFile } from "node:fs/promises";

export type WriteRequest = {
  absolutePath: string;
  contents: string;
};

/**
 * Placeholder write — throws until the atomic write pipeline is implemented.
 * The import of writeFile is intentional so the lint allowlist is exercised.
 */
export async function writeFile(request: WriteRequest): Promise<void> {
  void fsWriteFile;
  throw new Error(
    `write door not implemented yet (target: ${request.absolutePath})`,
  );
}

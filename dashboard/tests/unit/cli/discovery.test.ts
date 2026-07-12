import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discoverProjectRoot } from "../../../src/cli/discovery.js";

describe("discoverProjectRoot", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-disc-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds root three levels up", () => {
    mkdirSync(join(root, ".hyperflow"), { recursive: true });
    const nested = join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    const r = discoverProjectRoot(nested);
    expect(r.found).toBe(true);
    if (r.found) expect(r.rootDir).toBe(realpathSync(root));
  });

  it("not-found when no .hyperflow", () => {
    const nested = join(root, "x");
    mkdirSync(nested, { recursive: true });
    const r = discoverProjectRoot(nested);
    expect(r.found).toBe(false);
  });

  it("--root skips walk", () => {
    mkdirSync(join(root, "proj", ".hyperflow"), { recursive: true });
    const r = discoverProjectRoot(join(root, "other"), join(root, "proj"));
    expect(r.found).toBe(true);
    if (r.found) expect(r.rootDir).toContain("proj");
  });

  it("symlinked project root returns realpath", () => {
    const real = join(root, "real");
    mkdirSync(join(real, ".hyperflow"), { recursive: true });
    writeFileSync(join(real, ".hyperflow", "x"), "1");
    const link = join(root, "link");
    try {
      symlinkSync(real, link);
    } catch {
      // Windows without privilege — skip
      return;
    }
    const nested = join(link, "sub");
    mkdirSync(nested, { recursive: true });
    const r2 = discoverProjectRoot(nested);
    expect(r2.found).toBe(true);
    if (r2.found) {
      expect(r2.rootDir).not.toContain("link");
      expect(r2.rootDir).toContain("real");
    }
  });
});

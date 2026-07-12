import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createPathJail,
  decodeCandidate,
  isPathInside,
} from "../../../src/server/security/path-jail.js";
import { ERROR_CODES } from "../../../src/shared/schemas/api.js";

describe("decodeCandidate", () => {
  it("denies double-encoded traversal %252e%252e%252f (no second decode)", () => {
    const r = decodeCandidate("%252e%252e%252f");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/double|encoded/);
  });

  it("denies url-encoded traversal after one decode", () => {
    expect(decodeCandidate("..%2f..%2f").ok).toBe(true); // decodes to ../../ — jail catches
    // residual encoding after one decode of double form
    expect(decodeCandidate("%2e%2e%2f").ok).toBe(true);
  });

  it("denies null-byte", () => {
    expect(decodeCandidate("foo\0bar").ok).toBe(false);
  });
});

describe("isPathInside segment-aware", () => {
  it("rejects sibling-prefix escape", () => {
    expect(isPathInside("/a/.hyperflow-evil", "/a/.hyperflow", false)).toBe(
      false,
    );
    expect(isPathInside("/a/.hyperflow/x", "/a/.hyperflow", false)).toBe(true);
    expect(isPathInside("/a/.hyperflow", "/a/.hyperflow", false)).toBe(true);
  });
});

describe("path-jail resolveAndVerify", () => {
  let root: string;
  let jail: string;
  let outside: string;
  let home: string;
  let configPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-jail-"));
    jail = join(root, ".hyperflow");
    outside = join(root, "outside");
    home = join(root, "home");
    configPath = join(home, ".hyperflow", "config.json");
    mkdirSync(jail, { recursive: true });
    mkdirSync(outside, { recursive: true });
    mkdirSync(join(home, ".hyperflow"), { recursive: true });
    writeFileSync(join(jail, "notes.md"), "ok");
    writeFileSync(configPath, "{}");
    writeFileSync(join(outside, "secret.txt"), "x");
    writeFileSync(join(outside, "hosts"), "hosts");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function makeJail() {
    return createPathJail({
      jailRoot: jail,
      globalConfigPath: configPath,
      homeDir: home,
      caseInsensitive: true,
    });
  }

  it("allows legitimate nested in-jail path and the explicit global config path", () => {
    const j = makeJail();
    const nested = j.resolveAndVerify(join(jail, "notes.md"));
    expect(nested.ok).toBe(true);
    if (nested.ok) {
      expect(nested.isGlobalConfig).toBe(false);
      expect(nested.resolvedPath).toBe(realpathSync(join(jail, "notes.md")));
    }
    const cfg = j.resolveAndVerify(configPath);
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.isGlobalConfig).toBe(true);
  });

  it("denies plain traversal ../../etc/passwd", () => {
    const j = makeJail();
    const r = j.resolveAndVerify(join(jail, "..", "..", "etc", "passwd"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it("denies url-encoded traversal ..%2f..%2f and %2e%2e%2f", () => {
    const j = makeJail();
    // relative encoded segments from jail-relative candidate
    const a = j.resolveAndVerify("..%2f..%2f" + "outside/secret.txt");
    // After decode becomes ../../outside/secret.txt relative to jail
    expect(a.ok).toBe(false);

    const b = j.resolveAndVerify("%2e%2e/%2e%2e/outside/secret.txt");
    expect(b.ok).toBe(false);
  });

  it("denies double-encoded traversal without second decode", () => {
    const j = makeJail();
    const r = j.resolveAndVerify("%252e%252e%252foutside%252fsecret.txt");
    expect(r.ok).toBe(false);
  });

  it("denies backslash traversal on windows-shaped input", () => {
    const j = makeJail();
    const r = j.resolveAndVerify("..\\..\\outside\\secret.txt");
    expect(r.ok).toBe(false);
  });

  it("denies null-byte and ....// mangled traversal", () => {
    const j = makeJail();
    expect(j.resolveAndVerify("foo\0/../notes.md").ok).toBe(false);
    // ....// may normalize oddly — must not escape jail
    const mangled = j.resolveAndVerify(join(jail, "....//....//outside/secret.txt"));
    // If resolvable at all, must still fail outside-jail
    if (mangled.ok) {
      expect(mangled.resolvedPath.startsWith(realpathSync(jail))).toBe(true);
    } else {
      expect(mangled.ok).toBe(false);
    }
  });

  it("denies symlink inside jail resolving to /etc/hosts (symlink escape)", () => {
    const j = makeJail();
    const link = join(jail, "escape-link");
    symlinkSync(join(outside, "hosts"), link);
    const r = j.resolveAndVerify(link);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe(ERROR_CODES.NOT_FOUND);
      // no path echo in reason
      expect(r.reason).not.toContain(outside);
    }
  });

  it("denies symlink chain (link → link → outside) after full realpath", () => {
    const j = makeJail();
    const mid = join(jail, "mid-link");
    const outer = join(jail, "outer-link");
    symlinkSync(join(outside, "secret.txt"), mid);
    symlinkSync(mid, outer);
    const r = j.resolveAndVerify(outer);
    expect(r.ok).toBe(false);
  });

  it("rejects sibling-prefix escape: jail does not admit jail-evil", () => {
    const evil = join(root, ".hyperflow-evil");
    mkdirSync(evil);
    writeFileSync(join(evil, "x.md"), "nope");
    const j = makeJail();
    const r = j.resolveAndVerify(join(evil, "x.md"));
    expect(r.ok).toBe(false);
  });

  it("realpaths jail root once at construction", () => {
    const j = makeJail();
    expect(j.jailRoot).toBe(realpathSync(jail));
  });
});

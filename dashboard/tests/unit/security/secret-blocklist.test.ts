import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  createSecretBlocklist,
  defaultDefaultsPath,
  loadSecurityPatterns,
} from "../../../src/server/security/secret-blocklist.js";
import { ERROR_CODES } from "../../../src/shared/schemas/api.js";

describe("secret-blocklist patterns source", () => {
  it("loads blocked/allowed sets from config/defaults.json (no drift)", () => {
    const path = defaultDefaultsPath();
    const fromFile = JSON.parse(readFileSync(path, "utf8")) as {
      security: { blockedFiles: string[]; allowedFiles: string[] };
    };
    const loaded = loadSecurityPatterns(path);
    expect(loaded.blockedFiles).toEqual(fromFile.security.blockedFiles);
    expect(loaded.allowedFiles).toEqual(fromFile.security.allowedFiles);
    // sanity: expected critical entries present
    expect(loaded.blockedFiles).toContain(".env");
    expect(loaded.blockedFiles).toContain("*.pem");
    expect(loaded.allowedFiles).toContain(".env.example");
  });
});

describe("secret-blocklist check", () => {
  let root: string;
  let home: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hf-bl-"));
    home = join(root, "home");
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function bl() {
    return createSecretBlocklist({
      defaultsPath: defaultDefaultsPath(),
      homeDir: home,
      caseInsensitive: true,
    });
  }

  it("blocks .env, .env.local, key.pem, server.key, id_rsa, credentials.json, service-account-prod.json", () => {
    const b = bl();
    const cases = [
      join(root, ".env"),
      join(root, ".env.local"),
      join(root, "key.pem"),
      join(root, "server.key"),
      join(root, "id_rsa"),
      join(root, "credentials.json"),
      join(root, "service-account-prod.json"),
    ];
    for (const p of cases) {
      const v = b.check(p);
      expect(v.blocked, p).toBe(true);
      if (v.blocked) expect(v.code).toBe(ERROR_CODES.PATH_BLOCKED);
    }
  });

  it("allows .env.example / .env.template / .env.sample (allowedFiles)", () => {
    const b = bl();
    for (const name of [".env.example", ".env.template", ".env.sample"]) {
      expect(b.check(join(root, name)).blocked).toBe(false);
    }
  });

  it("blocks symlink named readme.md that resolves to .env (post-resolution)", () => {
    // Guard is applied to RESOLVED path — caller realpaths first.
    const envPath = join(root, ".env");
    writeFileSync(envPath, "SECRET=1");
    const link = join(root, "readme.md");
    symlinkSync(envPath, link);
    const b = bl();
    // Simulate post-resolution: check the real target, not the link name.
    const resolved = resolve(envPath);
    expect(b.check(resolved).blocked).toBe(true);
  });

  it("blocks home-anchored ~/.ssh/* patterns", () => {
    const b = bl();
    const sshKey = join(home, ".ssh", "id_rsa");
    expect(b.check(sshKey).blocked).toBe(true);
    expect(b.check(join(home, ".kube", "config")).blocked).toBe(true);
  });

  it("case bypass: .ENV denied on case-insensitive fs", () => {
    const b = bl();
    expect(b.check(join(root, ".ENV")).blocked).toBe(true);
  });
});

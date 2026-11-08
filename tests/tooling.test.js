import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = ["hyperflow-plan", "hyperflow-smash", "hyperflow-crash", "hyperflow-agents-skill"];
const COMMANDS = SKILLS.map((name) => `${name}.md`);
const CONTRACT = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/core-contract.json"), "utf8"));

function sourceFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT })
    .toString()
    .split("\0")
    .filter((path) => path && existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile());
}

function packagedFiles() {
  const result = execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: ROOT, encoding: 'utf8' });
  const metadata = JSON.parse(result);
  const packageInfo = Array.isArray(metadata) ? metadata[0] : Object.values(metadata)[0];
  assert.ok(Array.isArray(packageInfo.files), 'package manager returned no distribution manifest');
  return packageInfo.files.map((entry) => entry.path);
}

function tempRoot(label) {
  return mkdtempSync(join(tmpdir(), `hyperflow-${label}-`));
}

function createInstallCheckout(root) {
  mkdirSync(join(root, "skills"), { recursive: true });
  mkdirSync(join(root, "runtime"), { recursive: true });
  mkdirSync(join(root, "commands"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"hyperflow","version":"6.10.0"}\n');
  writeFileSync(join(root, "runtime", "cli.mjs"), "process.exitCode = 0;\n");
  for (const skill of SKILLS) {
    mkdirSync(join(root, "skills", skill), { recursive: true });
    writeFileSync(join(root, "skills", skill, "SKILL.md"), `---\nname: ${skill}\n---\n`);
  }
  for (const command of COMMANDS) {
    writeFileSync(join(root, "commands", command), `<!-- hyperflow-owned-command v1 root=@HYPERFLOW_PLUGIN_ROOT@ -->\n@HYPERFLOW_PLUGIN_ROOT@/runtime/cli.mjs\n`);
  }
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "remote", "add", "origin", "https://github.com/Mohammed-Abdelhady/hyperflow.git"]);
}

function runInstaller(root, home, options = [], extraEnv = {}, cwd = undefined) {
  return spawnSync("bash", [join(ROOT, "install.sh"), ...options], {
    encoding: "utf8",
    cwd,
    env: { ...process.env, HOME: home, HYPERFLOW_HOME: root, OPENCODE_CONFIG_DIR: join(home, ".config", "opencode"), PATH: [dirname(process.execPath), "/usr/bin", "/bin"].join(":"), ...extraEnv },
  });
}

test("OpenCode setup links four skills and four owned commands without executing the workflow", () => {
  const temp = tempRoot("install");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const opencode = join(home, ".config", "opencode");
    createInstallCheckout(checkout);
    mkdirSync(join(opencode, "skills"), { recursive: true });
    mkdirSync(join(opencode, "commands"), { recursive: true });

    const result = runInstaller(checkout, home, ["--link-only"]);

    assert.equal(result.status, 0, result.stderr);
    for (const skill of SKILLS) {
      assert.equal(readlinkSync(join(opencode, "skills", skill)), join(checkout, "skills", skill));
    }
    for (const command of COMMANDS) {
      const source = readFileSync(join(opencode, "commands", command), "utf8");
      assert.ok(source.includes(`root=${realpathSync(checkout)}`), source);
      assert.ok(source.includes(`${realpathSync(checkout)}/runtime/cli.mjs`), source);
    }
    assert.equal(existsSync(join(home, ".hyperflow")), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("Codex-only installation copies four skills and does not create command files", () => {
  const temp = tempRoot("codex-only");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const skillsRoot = join(home, ".codex", "skills");
    const preserved = join(skillsRoot, "shared-skill");
    createInstallCheckout(checkout);
    mkdirSync(skillsRoot, { recursive: true });
    mkdirSync(preserved, { recursive: true });
    writeFileSync(join(preserved, "SKILL.md"), "shared skill\n");

    const result = runInstaller(checkout, home, ["--link-only"]);

    assert.equal(result.status, 0, result.stderr);
    for (const skill of SKILLS) {
      const copy = join(skillsRoot, skill);
      assert.equal(lstatSync(copy).isDirectory(), true);
      assert.equal(lstatSync(copy).isSymbolicLink(), false);
      assert.equal(readFileSync(join(copy, ".hyperflow-source.json"), "utf8").includes(realpathSync(checkout)), true);
    }
    assert.equal(readFileSync(join(preserved, "SKILL.md"), "utf8"), "shared skill\n");
    assert.equal(existsSync(join(home, ".config", "opencode", "commands")), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("Claude Code-only installation links four skills and leaves provider config alone", () => {
  const temp = tempRoot("claude-only");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const skillsRoot = join(home, ".claude", "skills");
    const providerConfig = join(home, ".claude", "settings.json");
    createInstallCheckout(checkout);
    mkdirSync(skillsRoot, { recursive: true });
    writeFileSync(providerConfig, '{"credentials":"fixture-value"}\n');

    const result = runInstaller(checkout, home, ["--link-only"]);

    assert.equal(result.status, 0, result.stderr);
    for (const skill of SKILLS) assert.equal(readlinkSync(join(skillsRoot, skill)), join(checkout, "skills", skill));
    assert.equal(readFileSync(providerConfig, "utf8"), '{"credentials":"fixture-value"}\n');
    assert.equal(existsSync(join(home, ".claude", "commands")), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("preflight conflict preserves foreign command and does not leave partial links", () => {
  const temp = tempRoot("conflict");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const opencode = join(home, ".config", "opencode");
    createInstallCheckout(checkout);
    mkdirSync(join(opencode, "skills"), { recursive: true });
    mkdirSync(join(opencode, "commands"), { recursive: true });
    const foreign = join(opencode, "commands", "hyperflow-crash.md");
    writeFileSync(foreign, "owner-authored command\n");

    const result = runInstaller(checkout, home, ["--link-only"]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /command path conflict/i);
    assert.equal(readFileSync(foreign, "utf8"), "owner-authored command\n");
    for (const skill of SKILLS) assert.equal(existsSync(join(opencode, "skills", skill)), false);
    for (const command of COMMANDS.filter((name) => name !== "hyperflow-crash.md")) {
      assert.equal(existsSync(join(opencode, "commands", command)), false);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("failed command registration restores existing owned links and command files", () => {
  const temp = tempRoot("rollback");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const opencode = join(home, ".config", "opencode");
    const skillsRoot = join(opencode, "skills");
    const commandsRoot = join(opencode, "commands");
    const fakeBin = join(temp, "bin");
    createInstallCheckout(checkout);
    mkdirSync(skillsRoot, { recursive: true });
    mkdirSync(commandsRoot, { recursive: true });
    mkdirSync(fakeBin);
    const existingSkill = join(skillsRoot, "hyperflow-plan");
    const existingTarget = join(checkout, "skills", "hyperflow-plan");
    symlinkSync(existingTarget, existingSkill);
    const existingCommand = join(commandsRoot, "hyperflow-plan.md");
    const priorCommand = `<!-- hyperflow-owned-command v1 root=${realpathSync(checkout)} -->\nprevious command content\n`;
    writeFileSync(existingCommand, priorCommand);
    const fakeLn = join(fakeBin, "ln");
    writeFileSync(fakeLn, "#!/usr/bin/env bash\nfor arg in \"$@\"; do case \"$arg\" in */skills/hyperflow-crash) exit 42;; esac; done\nexec /bin/ln \"$@\"\n");
    chmodSync(fakeLn, 0o755);

    const result = runInstaller(checkout, home, ["--link-only"], { PATH: `${fakeBin}:/usr/bin:/bin` });

    assert.notEqual(result.status, 0);
    assert.equal(lstatSync(existingSkill).isSymbolicLink(), true);
    assert.equal(readlinkSync(existingSkill), existingTarget);
    assert.equal(readFileSync(existingCommand, "utf8"), priorCommand);
    for (const skill of SKILLS.slice(1)) assert.equal(existsSync(join(skillsRoot, skill)), false);
    for (const command of COMMANDS.slice(1)) assert.equal(existsSync(join(commandsRoot, command)), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("uninstall removes only registrations owned by this checkout", () => {
  const temp = tempRoot("uninstall");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const opencode = join(home, ".config", "opencode");
    const skillsRoot = join(opencode, "skills");
    const commandsRoot = join(opencode, "commands");
    const sharedSkill = join(skillsRoot, "shared-skill");
    const foreignCommand = join(commandsRoot, "manual.md");
    createInstallCheckout(checkout);
    mkdirSync(sharedSkill, { recursive: true });
    mkdirSync(commandsRoot, { recursive: true });
    writeFileSync(join(sharedSkill, "SKILL.md"), "keep\n");
    writeFileSync(foreignCommand, "keep\n");

    const installed = runInstaller(checkout, home, ["--link-only"]);
    assert.equal(installed.status, 0, installed.stderr);
    const uninstalled = runInstaller(checkout, home, ["--uninstall"]);
    assert.equal(uninstalled.status, 0, uninstalled.stderr);
    for (const skill of SKILLS) assert.equal(existsSync(join(skillsRoot, skill)), false);
    for (const command of COMMANDS) assert.equal(existsSync(join(commandsRoot, command)), false);
    assert.equal(readFileSync(join(sharedSkill, "SKILL.md"), "utf8"), "keep\n");
    assert.equal(readFileSync(foreignCommand, "utf8"), "keep\n");
    assert.equal(existsSync(checkout), true);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("status is read only and only owned legacy links are migrated", () => {
  const temp = tempRoot("status");
  try {
    const checkout = join(temp, "checkout");
    const home = join(temp, "home");
    const opencode = join(home, ".config", "opencode");
    const skillsRoot = join(opencode, "skills");
    createInstallCheckout(checkout);
    mkdirSync(skillsRoot, { recursive: true });
    symlinkSync(join(checkout, "skills", "plan"), join(skillsRoot, "plan"));
    const shared = join(temp, "shared");
    mkdirSync(shared);
    symlinkSync(shared, join(skillsRoot, "audit"));
    const state = join(home, ".hyperflow", "state");
    mkdirSync(state, { recursive: true });
    writeFileSync(join(state, "keep.txt"), "preserve me\n");

    const status = runInstaller(checkout, home, ["--status", "--json"]);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).read_only, true);
    assert.equal(lstatSync(join(skillsRoot, "plan")).isSymbolicLink(), true);
    assert.equal(lstatSync(join(skillsRoot, "audit")).isSymbolicLink(), true);
    assert.equal(readFileSync(join(state, "keep.txt"), "utf8"), "preserve me\n");

    const install = runInstaller(checkout, home, ["--link-only"]);
    assert.equal(install.status, 0, install.stderr);
    assert.equal(existsSync(join(skillsRoot, "plan")), false);
    for (const skill of SKILLS) assert.equal(readlinkSync(join(skillsRoot, skill)), join(checkout, "skills", skill));
    assert.equal(lstatSync(join(skillsRoot, "audit")).isSymbolicLink(), true);
    assert.equal(readFileSync(join(state, "keep.txt"), "utf8"), "preserve me\n");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("status treats a malformed link into the current checkout as partial, not foreign conflict", () => {
  const temp = tempRoot("relative-status");
  try {
    const home = join(temp, "home");
    const checkout = join(home, "checkout");
    const opencode = join(home, ".config", "opencode");
    createInstallCheckout(checkout);
    mkdirSync(join(opencode, "skills"), { recursive: true });
    symlinkSync(join(checkout, "skills", "hyperflow-smash"), join(opencode, "skills", "hyperflow-plan"));

    const result = runInstaller(checkout, home, ["--status", "--json"], { HYPERFLOW_HOME: "checkout" }, home);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).skill_links.opencode.state, "partial");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("shipped package stays within the existing footprint and maintained-file limits", () => {
  const files = packagedFiles();
  const bytes = files.reduce((total, path) => total + statSync(join(ROOT, path)).size, 0);
  assert.ok(files.length <= CONTRACT.budgets.shippedFilesMax, `shipped files: ${files.length}`);
  assert.ok(bytes <= CONTRACT.budgets.shippedBytesMax, `shipped bytes: ${bytes}`);
  for (const path of sourceFiles()) {
    if (path === "CHANGELOG.md") continue;
    if ([".png", ".jpg", ".jpeg", ".svg", ".ico", ".woff", ".woff2"].includes(extname(path))) continue;
    const source = readFileSync(join(ROOT, path), "utf8");
    assert.ok(source.split(/\r?\n/).length <= CONTRACT.budgets.maintainedFileLinesMax, `${path} exceeds 350 lines`);
  }
});

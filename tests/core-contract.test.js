import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTRACT = JSON.parse(read("tests/fixtures/core-contract.json"));

function pathFromRoot(path) {
  return join(ROOT, path);
}

function read(path) {
  return readFileSync(pathFromRoot(path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function filesUnder(path) {
  const absolute = pathFromRoot(path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [path];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory() && [".git", ".hyperflow", "node_modules"].includes(entry.name)) return [];
    if (entry.isDirectory()) return filesUnder(child);
    return entry.isFile() ? [child] : [];
  });
}

function shippedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT })
    .toString()
    .split("\0")
    .filter((path) => path && existsSync(pathFromRoot(path)) && statSync(pathFromRoot(path)).isFile());
}

function words(markdown) {
  return markdown.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)?.length ?? 0;
}

function laneWindow(text, lane) {
  const index = text.toLowerCase().indexOf(lane.toLowerCase());
  assert.notEqual(index, -1, `${lane} lane is missing from the core contract`);
  return text.slice(Math.max(0, index - 240), index + 1800);
}

function assertNear(text, subject, pattern, message) {
  assert.match(laneWindow(text, subject), pattern, message);
}

function currentSurface(path) {
  const source = read(path);
  const migrationDocs = new Set(["README.md", "PRIVACY.md", "docs/installation.md", "install.sh"]);
  if (!migrationDocs.has(path)) return source;

  const htmlStart = "<!-- hyperflow:legacy-migration:start -->";
  const htmlEnd = "<!-- hyperflow:legacy-migration:end -->";
  const shellStart = "# hyperflow:legacy-migration:start";
  const shellEnd = "# hyperflow:legacy-migration:end";
  assert.equal(source.split(htmlStart).length - 1, source.split(htmlEnd).length - 1, `${path} has an unbalanced HTML migration block`);
  assert.equal(source.split(shellStart).length - 1, source.split(shellEnd).length - 1, `${path} has an unbalanced shell migration block`);
  return source
    .replace(/<!-- hyperflow:legacy-migration:start -->[\s\S]*?<!-- hyperflow:legacy-migration:end -->/g, "")
    .replace(/# hyperflow:legacy-migration:start[\s\S]*?# hyperflow:legacy-migration:end/g, "");
}

test("core manifests parse and share one version", () => {
  const pkg = json("package.json");
  const claude = json(".claude-plugin/plugin.json");
  const codex = json(".codex-plugin/plugin.json");
  const marketplace = json(".claude-plugin/marketplace.json");
  const version = pkg.version;

  assert.equal(pkg.name, "hyperflow");
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(claude.version, version);
  assert.equal(codex.version, version);
  assert.equal(marketplace.metadata.version, version);
  assert.ok(marketplace.plugins.length > 0);
  for (const plugin of marketplace.plugins) assert.equal(plugin.version, version);
  assert.equal(read("skills/hyperflow/VERSION").trim(), version);
  for (const skill of CONTRACT.skills) {
    const frontmatterVersion = read(`skills/${skill}/SKILL.md`).match(/^version:\s*([^\s]+)$/m)?.[1];
    assert.equal(frontmatterVersion, version, `${skill}/SKILL.md version must match ${version}`);
  }

  for (const instructions of ["AGENTS.md", "CLAUDE.md"]) {
    if (!existsSync(pathFromRoot(instructions))) continue;
    assert.match(
      read(instructions),
      new RegExp(`hyperflow:doctrine:start version=${version.replaceAll(".", "\\.")}`),
      `${instructions} doctrine marker must match ${version}`,
    );
  }
});

test("only the seven public skills and seven specialist profiles ship", () => {
  const skills = readdirSync(pathFromRoot("skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(pathFromRoot(`skills/${entry.name}/SKILL.md`)))
    .map((entry) => entry.name)
    .sort();
  const specialists = filesUnder("agents")
    .filter((path) => extname(path) === ".md")
    .map((path) => basename(path, ".md"))
    .sort();

  assert.deepEqual(skills, [...CONTRACT.skills].sort());
  assert.deepEqual(specialists, [...CONTRACT.specialists].sort());
});

test("Direct, Focused, and Deep lanes retain their routing and call budgets", () => {
  const kernel = [
    "skills/hyperflow/SKILL.md",
    "skills/plan/SKILL.md",
    "skills/dispatch/SKILL.md",
    "AGENTS.md",
    "CLAUDE.md",
  ].map(read).join("\n");

  for (const [lane, fixture] of Object.entries(CONTRACT.lanes)) {
    const window = laneWindow(kernel, lane);
    for (const signal of fixture.signals) {
      assert.match(window, new RegExp(signal.replace("-", "[-–—]?"), "i"), `${lane} must retain ${signal}`);
    }
  }

  assertNear(kernel, "Direct", /Direct[^\n]*(?:\|\s*0\s*\||(?:zero|0) child (?:agents|calls))/i, "Direct must use no child agents");
  assertNear(kernel, "Focused", /(?:at most|maximum|max(?:imum)?)[^\n]{0,80}(?:two|2)[^\n]{0,40}(?:child|investigator|reviewer)/i, "Focused planning must cap child calls at two");
  assertNear(kernel, "Deep", /(?:at most|maximum|max(?:imum)?)[^\n]{0,80}(?:five|5) child calls/i, "Deep planning must cap child calls at five");
  assertNear(kernel, "Focused", /(?:at most|maximum|max(?:imum)?)[^\n]{0,80}(?:four|4)[^\n]{0,40}(?:child calls|full chain|plan plus build|plan \+ build)/i, "Focused full chain must cap child calls at four");
  assertNear(kernel, "Deep", /(?:at most|maximum|max(?:imum)?)[^\n]{0,80}(?:eight|8)[^\n]{0,40}(?:child calls|full chain|plan plus build|plan \+ build)/i, "Deep full chain must cap child calls at eight");

  assert.match(kernel, /Focused[^\n]{0,120}(?:6,?000|6k) planning tokens|(?:6,?000|6k) planning tokens[^\n]{0,120}Focused/i);
  assert.match(kernel, /Deep[^\n]{0,120}(?:18,?000|18k) planning tokens|(?:18,?000|18k) planning tokens[^\n]{0,120}Deep/i);
  assert.match(kernel, /Focused[^\n]{0,120}(?:20,?000|20k)[^\n]{0,40}(?:full chain|non-cached tokens)|(?:20,?000|20k)[^\n]{0,120}Focused/i);
  assert.match(kernel, /Deep[^\n]{0,120}(?:60,?000|60k)[^\n]{0,40}(?:full chain|non-cached tokens)|(?:60,?000|60k)[^\n]{0,120}Deep/i);
});

test("security floor retains blocked files and commands", () => {
  for (const path of ["AGENTS.md", "CLAUDE.md", "skills/hyperflow/SKILL.md"]) {
    const security = read(path);
    for (const pattern of CONTRACT.blockedFiles) {
      assert.ok(security.includes(pattern), `${path} is missing blocked file pattern: ${pattern}`);
    }
    for (const command of CONTRACT.blockedCommands) {
      assert.ok(security.includes(command), `${path} is missing blocked command: ${command}`);
    }
    assert.match(security, /SECURITY_VIOLATION:/, `${path} must retain the halt signal`);
  }
});

test("every shipped JSON document parses", () => {
  for (const path of shippedFiles().filter((path) => extname(path) === ".json")) {
    assert.doesNotThrow(() => json(path), path);
  }
});

test("briefs and skill entrypoints stay within structural budgets", () => {
  const worker = read("skills/hyperflow/worker-brief.md");
  const reviewer = read("skills/hyperflow/reviewer-brief.md");
  assert.ok(words(worker) <= CONTRACT.budgets.workerBriefWords, `worker brief is ${words(worker)} words`);
  assert.ok(words(reviewer) <= CONTRACT.budgets.reviewerBriefWords, `reviewer brief is ${words(reviewer)} words`);
  assert.match(read("skills/plan/SKILL.md"), /(?:under|at most|maximum)[^\n]{0,40}1,?200 words/i);

  for (const skill of CONTRACT.skills) {
    const body = read(`skills/${skill}/SKILL.md`);
    const lines = body.split(/\r?\n/).length;
    assert.ok(lines <= CONTRACT.budgets.skillEntrypointLines, `${skill}/SKILL.md is ${lines} lines`);
  }
});

test("shipped footprint and prompt-bearing text stay below regression ceilings", () => {
  const files = shippedFiles();
  const bytes = files.reduce((total, path) => total + statSync(pathFromRoot(path)).size, 0);
  assert.ok(files.length <= CONTRACT.budgets.shippedFilesMax, `shipped files: ${files.length}`);
  assert.ok(bytes <= CONTRACT.budgets.shippedBytesMax, `shipped bytes: ${bytes}`);

  for (const doctrine of ["AGENTS.md", "CLAUDE.md"]) {
    assert.ok(read(doctrine).length <= CONTRACT.budgets.portableDoctrineCharsMax, `${doctrine} is ${read(doctrine).length} characters`);
  }
  assert.ok(read("skills/plan/SKILL.md").length <= CONTRACT.budgets.planCharsMax);
  assert.ok(read("skills/dispatch/SKILL.md").length <= CONTRACT.budgets.dispatchCharsMax);
  assert.ok(read("skills/hyperflow/SKILL.md").length <= CONTRACT.budgets.hyperflowCharsMax);

  const componentDescriptions = [
    ...CONTRACT.skills.map((skill) => read(`skills/${skill}/SKILL.md`).match(/^description:.*$/m)?.[0] ?? ""),
    ...CONTRACT.specialists.map((specialist) => read(`agents/${specialist}.md`).match(/^description:.*$/m)?.[0] ?? ""),
  ].join("\n");
  assert.ok(componentDescriptions.length <= CONTRACT.budgets.componentDescriptionsCharsMax, `component descriptions: ${componentDescriptions.length} characters`);
});

test("installed runtime has no hooks, Python, dashboard, viewer, or legacy visual stack", () => {
  const allFiles = filesUnder(".");
  const pythonFiles = allFiles.filter((path) => extname(path) === ".py");
  assert.deepEqual(pythonFiles, []);

  assert.deepEqual(filesUnder("hooks"), [], "hooks directory must contain no shipped files");
  assert.deepEqual(filesUnder("viewer"), [], "viewer directory must contain no shipped files");
  assert.equal(Object.hasOwn(json(".codex-plugin/plugin.json"), "hooks"), false, "Codex manifest must not register hooks");

  const currentRoots = [
    ".claude-plugin",
    ".codex-plugin",
    ".github",
    "agents",
    "config",
    "docs",
    "scripts",
    "skills",
    "templates",
  ];
  const currentFiles = ["AGENTS.md", "CLAUDE.md", "PRIVACY.md", "README.md", "RELEASING.md", "install.sh", "package.json"]
    .filter((path) => existsSync(pathFromRoot(path)))
    .concat(currentRoots.flatMap(filesUnder))
    .filter((path) => !path.startsWith("docs/archive/"));
  const shipped = currentFiles
    .filter((path) => ![".png", ".gif", ".mp4", ".ttf"].includes(extname(path)))
    .map((path) => `${path}\n${currentSurface(path)}`)
    .join("\n");

  assert.doesNotMatch(shipped, /\bpython3\b|(?:^|\s)python\s+-|\.py\b|#![^\n]*python/i);
  assert.doesNotMatch(shipped, /viewer\/|hyperflow view|viewer["']?\s*:\s*\{|dashboard["']?\s*:\s*\{|\/(?:admin-)?dashboard\b/i);
  assert.doesNotMatch(shipped, /hooks\/session-start|hooks\/pre-compact|scripts\/hook-runtime|"SessionStart"|"PreCompact"/i);
  assert.doesNotMatch(shipped, /\.hyperflow\/artefacts|artefact\.schema|render-artefact|open-artefact/i);
});

test("installer exposes every public skill to OpenCode and uninstall removes owned links", () => {
  const installer = read("install.sh");
  const declared = installer.match(/CORE_SKILLS=\(([^)]+)\)/)?.[1].trim().split(/\s+/).sort();
  assert.deepEqual(declared, [...CONTRACT.skills].sort());
  assert.match(installer, /\.opencode\/skills/);
  assert.match(installer, /remove_owned_links/);
  assert.match(installer, /readlink/);
  assert.match(installer, /validate_checkout/);
  assert.match(installer, /remote get-url origin/);
  assert.match(installer, /\.config\/opencode\/skills/);
  assert.match(installer, /accept-major-migration/);
  assert.match(installer, /link-only/);
  assert.doesNotMatch(installer, /\.cursor\/skills|\.grok\/skills|\.gemini\/config\/skills/);
  assert.doesNotMatch(installer, /\bCODEX_[A-Z0-9_]+\b/);

  const temp = mkdtempSync(join(tmpdir(), "hyperflow-install-test-"));
  try {
    const installRoot = join(temp, "checkout");
    const skillsRoot = join(temp, ".opencode", "skills");
    const foreign = join(temp, "foreign-skill");
    mkdirSync(join(installRoot, "skills", "hyperflow"), { recursive: true });
    mkdirSync(skillsRoot, { recursive: true });
    mkdirSync(foreign, { recursive: true });
    symlinkSync(join(installRoot, "skills", "hyperflow"), join(skillsRoot, "hyperflow"));
    symlinkSync(foreign, join(skillsRoot, "plan"));

    const uninstall = spawnSync("bash", [pathFromRoot("install.sh"), "--uninstall"], {
      encoding: "utf8",
      env: { ...process.env, HOME: temp, HYPERFLOW_HOME: installRoot, PATH: "/usr/bin:/bin" },
    });
    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.equal(existsSync(join(skillsRoot, "hyperflow")), false, "owned link must be removed");
    assert.equal(lstatSync(join(skillsRoot, "plan")).isSymbolicLink(), true, "foreign link must remain");
    assert.equal(existsSync(installRoot), true, "checkout must remain");

    const untrusted = join(temp, "untrusted");
    mkdirSync(untrusted);
    execFileSync("git", ["init", "-q", untrusted]);
    execFileSync("git", ["-C", untrusted, "remote", "add", "origin", "https://example.com/not-hyperflow.git"]);
    const rejected = spawnSync("bash", [pathFromRoot("install.sh")], {
      encoding: "utf8",
      env: { ...process.env, HOME: temp, HYPERFLOW_HOME: untrusted, PATH: "/usr/bin:/bin" },
    });
    assert.notEqual(rejected.status, 0, "an unrelated checkout must be rejected");
    assert.match(rejected.stderr, /not the Hyperflow repository/);

    const noHostHome = join(temp, "no-host");
    mkdirSync(noHostHome);
    const noHost = spawnSync("bash", [pathFromRoot("install.sh"), "--link-only"], {
      encoding: "utf8",
      env: { ...process.env, HOME: noHostHome, HYPERFLOW_HOME: ROOT, PATH: "/usr/bin:/bin" },
    });
    assert.notEqual(noHost.status, 0, "an install with no detected host must not report success");
    assert.match(noHost.stderr, /No supported host was detected/);

    const conflictHome = join(temp, "conflict-host");
    const conflictSkills = join(conflictHome, ".config", "opencode", "skills");
    mkdirSync(conflictSkills, { recursive: true });
    symlinkSync(foreign, join(conflictSkills, "hyperflow"));
    const conflict = spawnSync("bash", [pathFromRoot("install.sh"), "--link-only"], {
      encoding: "utf8",
      env: { ...process.env, HOME: conflictHome, HYPERFLOW_HOME: ROOT, PATH: "/usr/bin:/bin" },
    });
    assert.notEqual(conflict.status, 0, "a partial OpenCode link set must not report success");
    assert.match(conflict.stderr, /skill path conflict/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("release path validates locally, stamps portable docs, and never pushes", () => {
  const release = read("scripts/release.sh");
  const bump = read("scripts/bump-version.sh");
  assert.match(release, /npm run validate-plugin/);
  assert.match(release, /npm run unittest/);
  assert.match(release, /npm run evals/);
  assert.match(release, /bash -n install\.sh scripts\/\*\.sh/);
  assert.match(release, /bump-version\.sh/);
  assert.match(release, /git tag -a/);
  assert.match(release, /Unreleased migration boundary requires a major version/);
  assert.doesNotMatch(release, /^\s*git push/m);
  assert.match(bump, /AGENTS\.md/);
  assert.match(bump, /CLAUDE\.md/);
  assert.match(bump, /hyperflow:doctrine:start version=/);
});

test("the pending migration boundary rejects patch releases", () => {
  const temp = mkdtempSync(join(tmpdir(), "hyperflow-major-release-test-"));
  const copyRoot = join(temp, "repo");
  try {
    for (const path of shippedFiles()) {
      const target = join(copyRoot, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(pathFromRoot(path), target);
    }
    const changelogPath = join(copyRoot, "CHANGELOG.md");
    const changelog = readFileSync(changelogPath, "utf8");
    writeFileSync(changelogPath, changelog.replace("## [Unreleased]\n", "## [Unreleased]\n\n### Migration\n- Test major boundary.\n"));
    execFileSync("git", ["init", "-q", copyRoot]);
    execFileSync("git", ["-C", copyRoot, "config", "user.name", "Hyperflow Test"]);
    execFileSync("git", ["-C", copyRoot, "config", "user.email", "test@example.invalid"]);
    execFileSync("git", ["-C", copyRoot, "add", "-A"]);
    execFileSync("git", ["-C", copyRoot, "commit", "-qm", "test: fixture"]);

    const result = spawnSync("bash", [join(copyRoot, "scripts", "release.sh"), "patch", "--dry-run"], {
      cwd: copyRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires a major version/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("version stamping executes against an isolated release tree", () => {
  const temp = mkdtempSync(join(tmpdir(), "hyperflow-release-test-"));
  const copyRoot = join(temp, "repo");
  try {
    mkdirSync(join(copyRoot, "scripts"), { recursive: true });
    for (const path of ["package.json", ".claude-plugin", ".codex-plugin", "skills", "AGENTS.md", "CLAUDE.md", "README.md", "CHANGELOG.md"]) {
      cpSync(pathFromRoot(path), join(copyRoot, path), { recursive: true });
    }
    cpSync(pathFromRoot("scripts/bump-version.sh"), join(copyRoot, "scripts", "bump-version.sh"));
    execFileSync("bash", [join(copyRoot, "scripts", "bump-version.sh"), "9.8.7"], {
      env: { ...process.env, HYPERFLOW_RELEASE_PREPARE: "1" },
      stdio: "pipe",
    });

    assert.equal(JSON.parse(readFileSync(join(copyRoot, "package.json"), "utf8")).version, "9.8.7");
    assert.equal(readFileSync(join(copyRoot, "skills", "hyperflow", "VERSION"), "utf8").trim(), "9.8.7");
    for (const skill of CONTRACT.skills) assert.match(readFileSync(join(copyRoot, "skills", skill, "SKILL.md"), "utf8"), /^version: 9\.8\.7$/m);
    assert.match(readFileSync(join(copyRoot, "AGENTS.md"), "utf8"), /hyperflow:doctrine:start version=9\.8\.7/);
    assert.match(readFileSync(join(copyRoot, "README.md"), "utf8"), /\[!\[version v9\.8\.7\]/);
    assert.match(readFileSync(join(copyRoot, "README.md"), "utf8"), /version-v9\.8\.7/);
    assert.match(readFileSync(join(copyRoot, "CHANGELOG.md"), "utf8"), /## \[9\.8\.7\] — \d{4}-\d{2}-\d{2}/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("natural-language routing preserves plan stop, build continuation, and push separation", () => {
  const kernel = read("skills/hyperflow/SKILL.md");
  const plan = read("skills/plan/SKILL.md");
  const dispatch = read("skills/dispatch/SKILL.md");
  const deploy = read("skills/deploy/SKILL.md");

  for (const signal of ["brainstorm", "explore", "what if", "should we", "unsure about"]) assert.match(kernel, new RegExp(signal, "i"));
  assert.match(plan, /plan-and-build[\s\S]{0,220}dispatch/i);
  assert.match(plan, /plan\/design\/explore\/decompose[\s\S]{0,120}stop/i);
  assert.match(dispatch, /explicit build or fix request authorizes local execution/i);
  assert.match(deploy, /Local completion never implies remote authorization/i);
  assert.match(deploy, /Push`?\s*\/\s*`?Hold/);
});

test("current Markdown documentation has no broken local links", () => {
  const documents = ["README.md", "PRIVACY.md", "RELEASING.md", ...filesUnder("docs").filter((path) => extname(path) === ".md")];
  for (const document of documents) {
    const source = read(document);
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      assert.equal(existsSync(join(dirname(pathFromRoot(document)), decodeURIComponent(target))), true, `${document} -> ${target}`);
    }
  }
});

#!/usr/bin/env node
/** Static golden-task evaluations for portable Hyperflow contracts. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TASKS = join(ROOT, "evals", "tasks");

function repoPath(path) {
  const target = resolve(ROOT, path);
  if (target !== ROOT && !target.startsWith(`${ROOT}/`)) throw new Error(`task path escapes repository: ${path}`);
  return target;
}

function read(path) {
  return readFileSync(repoPath(path), "utf8");
}

function json(path) {
  return JSON.parse(read(path));
}

function filesUnder(path) {
  const absolute = repoPath(path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git" || entry.name === ".hyperflow" || entry.name === "node_modules") return [];
    const child = join(path, entry.name);
    if (entry.isDirectory()) return filesUnder(child);
    return entry.isFile() ? [child] : [];
  });
}

function localMarkdownLinksResolve() {
  const documents = ["README.md", "PRIVACY.md", "RELEASING.md", ...filesUnder("docs").filter((path) => extname(path) === ".md")];
  for (const document of documents) {
    const source = read(document);
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
      if (!existsSync(resolve(dirname(repoPath(document)), decodeURIComponent(target)))) return `${document} -> ${target}`;
    }
  }
  return null;
}

function check(spec) {
  switch (spec.type) {
    case "files_exist": {
      const missing = spec.paths.filter((path) => !existsSync(repoPath(path)));
      return { ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : `${spec.paths.length} paths present` };
    }
    case "read_contains": {
      const ok = read(spec.path).includes(spec.value);
      return { ok, detail: `${spec.path} ${ok ? "contains" : "lacks"} ${JSON.stringify(spec.value)}` };
    }
    case "read_not_contains": {
      const ok = !read(spec.path).includes(spec.value);
      return { ok, detail: `${spec.path} ${ok ? "does not contain" : "contains"} ${JSON.stringify(spec.value)}` };
    }
    case "skill_set": {
      const actual = readdirSync(repoPath("skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(repoPath(`skills/${entry.name}/SKILL.md`)))
        .map((entry) => entry.name)
        .sort();
      const expected = [...spec.expected].sort();
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      return { ok, detail: ok ? `${actual.length} public skills` : `expected ${expected.join(", ")}; found ${actual.join(", ")}` };
    }
    case "json_key_absent": {
      const document = json(spec.path);
      const ok = !Object.hasOwn(document, spec.key);
      return { ok, detail: `${spec.path} ${ok ? "does not declare" : "declares"} ${spec.key}` };
    }
    case "docs_links_resolve": {
      const problem = localMarkdownLinksResolve();
      return { ok: problem === null, detail: problem === null ? "current Markdown links resolve" : `broken link ${problem}` };
    }
    case "host_claims": {
      const config = json(spec.path);
      const hosts = config.hosts ?? [];
      const ids = hosts.map((host) => host.id);
      const unique = new Set(ids).size === ids.length;
      const complete = hosts.every((host) => ["id", "claim", "status", "evidence"].every((key) => typeof host[key] === "string"));
      const readme = read("README.md").toLowerCase();
      const codexHonest = hosts.find((host) => host.id === "codex-cli")?.status === "preview_uncertified" && readme.includes("preview");
      const opencodeHonest = hosts.find((host) => host.id === "opencode")?.claim === "compatibility shim" && readme.includes("compatibility shim");
      const ok = hosts.length >= 3 && unique && complete && codexHonest && opencodeHonest;
      return { ok, detail: ok ? `${hosts.length} host claims are explicit` : "host claims are incomplete or overstate support" };
    }
    default:
      return { ok: false, detail: `unknown check type ${spec.type}` };
  }
}

function loadTasks() {
  const tasks = filesUnder("evals/tasks")
    .filter((path) => extname(path) === ".json")
    .sort()
    .map((path) => json(path));
  const ids = new Set();
  for (const task of tasks) {
    if (typeof task.id !== "string" || ids.has(task.id)) throw new Error(`invalid or duplicate eval id: ${task.id}`);
    if (!Array.isArray(task.checks) || task.checks.length === 0) throw new Error(`eval ${task.id} has no checks`);
    ids.add(task.id);
  }
  return tasks;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const tasks = loadTasks();
  if (args.has("--list")) {
    for (const task of tasks) console.log(`${task.id}: ${task.title}`);
    return 0;
  }

  const results = [];
  let failed = 0;
  for (const task of tasks) {
    const checks = task.checks.map((spec) => {
      try {
        return { ...check(spec), spec };
      } catch (error) {
        return { ok: false, detail: error.message, spec };
      }
    });
    const ok = checks.every((result) => result.ok);
    if (!ok) failed += 1;
    results.push({ id: task.id, title: task.title, ok, checks });
  }

  if (args.has("--json")) {
    console.log(JSON.stringify({ passed: tasks.length - failed, total: tasks.length, results }, null, 2));
  } else {
    for (const result of results) {
      console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.id}`);
      for (const item of result.checks) console.log(`    [${item.ok ? "ok" : "FAIL"}] ${item.spec.type} — ${item.detail}`);
    }
    console.log(`---\n${tasks.length - failed}/${tasks.length} evals passed`);
  }
  return failed === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`FAIL eval-harness: ${error.message}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * Rewrite `@shared/...` path-alias imports in compiled ESM under dist/
 * to relative filesystem paths. TypeScript leaves the alias intact; Node
 * cannot resolve it without this step.
 */
import {
  chmodSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const distRoot = join(root, "dist");
const sharedRoot = join(distRoot, "shared");

const TARGET_DIRS = [
  join(distRoot, "cli"),
  join(distRoot, "server"),
  join(distRoot, "shared"),
  join(distRoot, "client-types"),
];

const IMPORT_RE =
  /from\s+(["'])@shared\/([^"']+)\1/g;
const DYNAMIC_RE =
  /import\s*\(\s*(["'])@shared\/([^"']+)\1\s*\)/g;

function walkJs(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) walkJs(abs, out);
    else if (ent.isFile() && ent.name.endsWith(".js")) out.push(abs);
  }
  return out;
}

function toRelative(fromFile, sharedSubpath) {
  // sharedSubpath like "schemas/api.js"
  const target = join(sharedRoot, sharedSubpath);
  let rel = relative(dirname(fromFile), target);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel.split("\\").join("/");
}

function rewriteContents(file, source) {
  const replace = (_match, quote, sub) => {
    const rel = toRelative(file, sub);
    return `from ${quote}${rel}${quote}`;
  };
  const replaceDyn = (_match, quote, sub) => {
    const rel = toRelative(file, sub);
    return `import(${quote}${rel}${quote})`;
  };
  return source
    .replace(IMPORT_RE, replace)
    .replace(DYNAMIC_RE, replaceDyn);
}

let rewritten = 0;
for (const dir of TARGET_DIRS) {
  for (const file of walkJs(dir)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("@shared/")) continue;
    const next = rewriteContents(file, src);
    if (next !== src) {
      writeFileSync(file, next, "utf8");
      rewritten += 1;
    }
  }
}

// Ensure CLI bin is executable with a shebang.
const cliEntry = join(distRoot, "cli", "index.js");
try {
  let cli = readFileSync(cliEntry, "utf8");
  if (!cli.startsWith("#!")) {
    cli = `#!/usr/bin/env node\n${cli}`;
    writeFileSync(cliEntry, cli, "utf8");
  }
  chmodSync(cliEntry, 0o755);
} catch (err) {
  console.error("rewrite-shared-imports: CLI entry missing", err);
  process.exit(1);
}

// Sanity: no remaining @shared in runtime trees.
const remaining = [];
for (const dir of [join(distRoot, "cli"), join(distRoot, "server"), join(distRoot, "shared")]) {
  for (const file of walkJs(dir)) {
    const src = readFileSync(file, "utf8");
    if (src.includes("@shared/")) remaining.push(file);
  }
}
if (remaining.length > 0) {
  console.error("rewrite-shared-imports: unresolved @shared imports:");
  for (const f of remaining) console.error("  ", f);
  process.exit(1);
}

console.log(`rewrite-shared-imports: rewrote ${rewritten} file(s)`);

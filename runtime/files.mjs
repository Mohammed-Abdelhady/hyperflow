import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync,
  realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const MAX_JSON_BYTES = 1_048_576;
const PROTECTED = /(^|[\\/])(?:\.env(?:\..*)?|[^/\\]+\.(?:pem|key|crt)|\.ssh|\.aws|\.kube)([\\/]|$)|[\\/]\.config[\\/]gcloud([\\/]|$)/i;
const SYSTEM_SYMLINKS = process.platform === 'darwin'
  ? new Map([['/tmp', '/private/tmp'], ['/var', '/private/var']]) : new Map();
export const SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

function canonicalInputPath(path) {
  const absolute = resolve(path);
  if (PROTECTED.test(absolute)) throw new Error('Protected input path');
  let cursor = parse(absolute).root;
  for (const segment of relative(cursor, absolute).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      const expected = SYSTEM_SYMLINKS.get(cursor);
      const actual = realpathSync(cursor);
      if (expected !== actual) throw new Error('Symlinked input path is not allowed');
      cursor = actual;
    }
  }
  const canonical = realpathSync(absolute);
  if (PROTECTED.test(canonical)) throw new Error('Protected canonical input path');
  return canonical;
}

export function readJson(path) {
  const canonical = canonicalInputPath(path);
  const file = openSync(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_JSON_BYTES) throw new Error('Input must be a bounded private regular file');
    const buffer = Buffer.alloc(MAX_JSON_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = readSync(file, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (count === 0) break;
      bytesRead += count;
    }
    if (bytesRead > MAX_JSON_BYTES) throw new Error('Input must be a bounded private regular file');
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally { closeSync(file); }
}

export function artifactPath(repoRoot, ...segments) {
  const root = realpathSync(repoRoot);
  const destination = resolve(root, '.hyperflow', ...segments);
  const rel = relative(join(root, '.hyperflow'), destination);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Artifact path escapes state directory');
  let cursor = root;
  for (const segment of relative(root, dirname(destination)).split(sep)) {
    cursor = join(cursor, segment);
    try {
      if (!lstatSync(cursor).isDirectory() || lstatSync(cursor).isSymbolicLink()) throw new Error('State directory is not a real directory');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      mkdirSync(cursor, { mode: 0o700 });
    }
  }
  try { if (lstatSync(destination).isSymbolicLink()) throw new Error('State file is a symlink'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return destination;
}

export function writeJson(path, value) {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, value, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

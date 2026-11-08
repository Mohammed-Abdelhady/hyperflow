import { execFile, spawn } from 'node:child_process';
import { lstat, mkdtemp, readlink, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';

const execFileAsync = promisify(execFile);

export async function git(root, args, options = {}) {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  return args.includes('-z') ? stdout : stdout.trim();
}


export async function acquireRepositoryLock(repoRoot, ownerId) {
  const commonDir = path.resolve(repoRoot, await git(repoRoot, ['rev-parse', '--git-common-dir']));
  const database = new DatabaseSync(path.join(commonDir, 'hyperflow-locks.sqlite'));
  database.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS repository_locks (repo_root TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pid INTEGER NOT NULL)');
  database.exec('BEGIN IMMEDIATE');
  try {
    const existing = database.prepare('SELECT owner_id,pid FROM repository_locks WHERE repo_root=?').get(commonDir);
    if (existing && isProcessAlive(existing.pid)) throw new Error('Another Hyperflow run is integrating this repository');
    if (existing) database.prepare('DELETE FROM repository_locks WHERE repo_root=? AND owner_id=?').run(commonDir, existing.owner_id);
    database.prepare('INSERT INTO repository_locks (repo_root,owner_id,pid) VALUES (?,?,?)').run(commonDir, ownerId, process.pid);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    database.close();
    throw error;
  }
  return async () => {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare('DELETE FROM repository_locks WHERE repo_root=? AND owner_id=?').run(commonDir, ownerId);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    } finally { database.close(); }
  };
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export async function createExecutionWorktree(repoRoot, ref) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hyperflow-task-'));
  const worktreePath = path.join(directory, 'checkout');
  try {
    await git(repoRoot, ['worktree', 'add', '--detach', worktreePath, ref]);
    return { path: worktreePath, cleanup: () => removeExecutionWorktree(repoRoot, directory, worktreePath) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function removeExecutionWorktree(repoRoot, directory, worktreePath) {
  await git(repoRoot, ['worktree', 'remove', '--force', worktreePath]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}

export function isWithinWriteScope(filePath, writeScope) {
  const normalized = normalizeRelative(filePath);
  if (!normalized) return false;
  return writeScope.some(scope => {
    const allowed = normalizeRelative(scope);
    return allowed && (normalized === allowed || normalized.startsWith(`${allowed}/`));
  });
}

export function assertValidScopes(tasks) {
  for (const task of tasks) {
    for (const scope of task.writeScope ?? []) {
      if (!normalizeRelative(scope)) throw new Error(`Invalid write scope for ${task.id}: ${scope}`);
    }
  }
}

export function scopesOverlap(left, right) {
  return left.some(a => right.some(b => {
    const first = normalizeRelative(a);
    const second = normalizeRelative(b);
    return Boolean(first && second && (first === second || first.startsWith(`${second}/`) || second.startsWith(`${first}/`)));
  }));
}

export async function changedPaths(worktreePath) {
  const status = await git(worktreePath, ['status', '--porcelain', '--untracked-files=all', '-z']);
  const entries = status.split('\0').filter(Boolean);
  const paths = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    paths.push(entry.slice(3).replaceAll('\\', '/'));
    if (/[RC]/.test(entry.slice(0, 2)) && entries[index + 1]) paths.push(entries[++index].replaceAll('\\', '/'));
  }
  return paths;
}

export async function assertNoScopeSymlinks(worktreePath, task) {
  for (const scope of task.writeScope ?? []) {
    let current = worktreePath;
    for (const segment of scope.replaceAll('\\', '/').split('/')) {
      current = path.join(current, segment);
      try {
        if ((await lstat(current)).isSymbolicLink()) throw new Error(`Task ${task.id} write scope crosses a symbolic link: ${scope}`);
      } catch (error) {
        if (error.code === 'ENOENT') break;
        throw error;
      }
    }
  }
}

export async function assertChangesScoped(worktreePath, task) {
  const paths = await changedPaths(worktreePath);
  const outside = paths.filter(file => !isWithinWriteScope(file, task.writeScope ?? []));
  if (outside.length) throw new Error(`Task ${task.id} changed files outside writeScope: ${outside.join(', ')}`);
  return paths;
}

export async function commitTaskChanges(worktreePath, task) {
  const paths = await assertChangesScoped(worktreePath, task);
  if (!paths.length) return await git(worktreePath, ['rev-parse', 'HEAD']);
  await git(worktreePath, ['add', '-A']);
  await git(worktreePath, ['commit', '-m', `feat: implement ${task.id}`]);
  return await git(worktreePath, ['rev-parse', 'HEAD']);
}

export async function integrateTaskChanges(taskPath, integrationPath, task, baseSha) {
  const headSha = await git(taskPath, ['rev-parse', 'HEAD']);
  const paths = await assertCommitScoped(taskPath, task, baseSha, headSha);
  if (headSha === baseSha) return { headSha, paths };
  const { stdout: patch } = await execFileAsync('git', ['-C', taskPath, 'diff', '--binary', '--no-ext-diff', '--no-textconv', `${baseSha}..${headSha}`], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 });
  if (patch.length) {
    await runGitPatch(integrationPath, ['apply', '--index', '--3way'], patch);
    await git(integrationPath, ['commit', '-m', `feat: integrate ${task.id}`]);
  }
  return { headSha: await git(integrationPath, ['rev-parse', 'HEAD']), paths };
}

function normalizeRelative(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.replaceAll('\\', '/').split('/').includes('..')) return null;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

export async function assertCommitScoped(worktreePath, task, baseSha, headSha) {
  const names = (await git(worktreePath, ['diff', '--name-only', '-z', `${baseSha}..${headSha}`])).split('\0').filter(Boolean);
  const outside = names.filter(file => !isWithinWriteScope(file, task.writeScope ?? []));
  if (outside.length) throw new Error(`Task ${task.id} committed files outside writeScope: ${outside.join(', ')}`);
  return names;
}

export async function applyIntegratedChanges(integrationPath, repoRoot, baseSha, taskChanges, signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('Execution stopped');
  const rootHead = await git(repoRoot, ['rev-parse', 'HEAD']);
  if (rootHead !== baseSha) throw new Error(`Repository HEAD changed after approval: expected ${baseSha}, found ${rootHead}`);
  const headSha = await git(integrationPath, ['rev-parse', 'HEAD']);
  if (headSha === baseSha) return [];
  const integratedPaths = (await git(integrationPath, ['diff', '--name-only', '-z', `${baseSha}..${headSha}`])).split('\0').filter(Boolean);
  const userChanges = await changedPaths(repoRoot);
  const overlaps = userChanges.filter(changed => integratedPaths.some(file => pathsOverlap(changed, file)));
  const alreadyApplied = [];
  for (const file of overlaps) {
    if (integratedPaths.includes(file) && await rootMatchesTree(integrationPath, headSha, repoRoot, file)) alreadyApplied.push(file);
  }
  const conflicts = overlaps.filter(file => !alreadyApplied.includes(file));
  if (conflicts.length) throw new Error(`Integration overlaps existing repository changes: ${conflicts.join(', ')}`);
  for (const file of integratedPaths) await assertNoRootSymlinkAncestor(repoRoot, file);
  const pending = integratedPaths.filter(file => !alreadyApplied.includes(file));
  if (!pending.length) return integratedPaths;
  if (signal?.aborted) throw signal.reason ?? new Error('Execution stopped');
  const { stdout: patch } = await execFileAsync('git', ['-C', integrationPath, 'diff', '--binary', '--no-ext-diff', '--no-textconv', `${baseSha}..${headSha}`, '--', ...pending], {
    encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, ...abortOption(signal)
  });
  if (signal?.aborted) throw signal.reason ?? new Error('Execution stopped');
  if (patch.length) await runGitPatch(repoRoot, ['apply', '--3way'], patch, signal);
  return integratedPaths;
}

async function assertNoRootSymlinkAncestor(repoRoot, filePath) {
  const segments = filePath.split('/');
  let current = repoRoot;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Integration path crosses a repository symlink: ${filePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function rootMatchesTree(integrationPath, headSha, repoRoot, filePath) {
  const entry = (await git(integrationPath, ['ls-tree', '-z', headSha, '--', filePath])).split('\0').filter(Boolean)[0];
  if (!entry) {
    try { await lstat(path.join(repoRoot, filePath)); return false; }
    catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  }
  const separator = entry?.indexOf('\t') ?? -1;
  if (separator < 0) return false;
  const candidateHash = entry.slice(0, separator).split(' ')[2];
  const localPath = path.join(repoRoot, filePath);
  try {
    const info = await lstat(localPath);
    if (info.isSymbolicLink() !== (entry.slice(0, separator).split(' ')[0] === '120000')) return false;
    const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(localPath)) : undefined;
    const localHash = bytes
      ? await runGitInput(repoRoot, ['hash-object', '--stdin'], bytes)
      : await git(repoRoot, ['hash-object', '--', filePath]);
    const candidateMode = entry.slice(0, separator).split(' ')[0];
    const localMode = (await stat(localPath)).mode;
    const executableMatches = candidateMode === '100755' ? Boolean(localMode & 0o111) : candidateMode !== '100644' || !Boolean(localMode & 0o111);
    return localHash.trim() === candidateHash && executableMatches;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function runGitPatch(root, args, patch, signal) {
  return runGitInput(root, args, patch, signal).then(() => undefined);
}

function runGitInput(root, args, input, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Execution stopped'));
    const child = spawn('git', ['-C', root, ...args], { stdio: ['pipe','pipe','pipe'], ...abortOption(signal) });
    const output = [];
    let stderr = '';
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Buffer.concat(output).toString('utf8')) : reject(new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`)));
    child.stdin.end(input);
  });
}

function abortOption(signal) {
  return typeof signal?.addEventListener === 'function' ? { signal } : {};
}

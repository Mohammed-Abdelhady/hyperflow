import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROTECTED = /(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|crt)|\.ssh|\.aws|\.kube)(\/|$)|(^|\/)\.config\/gcloud(\/|$)/i;
const MAX_CHANGED_PATHS = 1000;

export function snapshotCurrentDiff(root) {
  const git = (args, options = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options });
  const baseSha = git(['rev-parse', 'HEAD']).trim();
  const paths = [...new Set(git(['status', '--porcelain=v1', '--no-renames', '--untracked-files=all', '-z'])
    .split('\0').filter(Boolean).map((entry) => entry.slice(3)))];
  if (!paths.length) return { baseSha, headSha: baseSha, sourceTree: git(['rev-parse', 'HEAD^{tree}']).trim(), current: true };
  if (paths.length > MAX_CHANGED_PATHS) throw new Error('Current review exceeds the changed-path bound');
  for (const path of paths) {
    if (PROTECTED.test(path)) throw new Error(`Protected review path: ${path}`);
    try { if (lstatSync(join(root, path)).isSymbolicLink()) throw new Error(`Review snapshot cannot follow a changed symlink: ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const temporary = mkdtempSync(join(tmpdir(), 'hyperflow-review-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
  try {
    git(['read-tree', baseSha], { env });
    git(['add', '-A', '--', ...paths], { env });
    const sourceTree = git(['write-tree'], { env }).trim();
    const headSha = git(['commit-tree', sourceTree, '-p', baseSha], { input: 'chore: snapshot review candidate\n' }).trim();
    return { baseSha, headSha, sourceTree, current: true };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

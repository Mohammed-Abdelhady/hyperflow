import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export async function repoFixture(callback) {
  const root = await mkdtemp(path.join(tmpdir(), 'hyperflow-execution-'));
  const statePath = path.join(root, 'state', 'run.sqlite');
  const git = args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git(['init', '-q']);
    git(['config', 'user.email', 'runner@example.test']);
    git(['config', 'user.name', 'Runner Fixture']);
    await writeFile(path.join(root, 'tracked.txt'), 'baseline\n');
    git(['add', 'tracked.txt']);
    git(['commit', '-qm', 'baseline']);
    await callback({ root, statePath, baseSha: git(['rev-parse', 'HEAD']), git });
  } finally { await rm(root, { recursive: true, force: true }); }
}

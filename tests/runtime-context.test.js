import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleContext } from '../runtime/context.mjs';

const workflow = { id: 'demo', goal: 'ship', repository: { baseSha: 'base' } };
const task = { id: 'T02', title: 'Verify', readScope: ['src'], writeScope: [], acceptance: ['works'] };

test('context includes bounded repository sources and dependency provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hyperflow-context-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'a.js'), 'export const answer = 42;');
    const result = await assembleContext({ repoRoot: root, task, workflow, dependencyResults: [{ taskId: 'T01', summary: 'implemented', headSha: 'abc' }] });
    assert.match(result.text, /src\/a\.js/);
    assert.match(result.text, /export const answer = 42/);
    assert.match(result.text, /T01/);
    assert.equal(result.sources[0].path, 'src/a.js');
    assert.ok(Buffer.byteLength(result.text) <= 32768);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('context rejects traversal, secrets and symlink escapes before opening outside files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hyperflow-context-'));
  const outside = await mkdtemp(join(tmpdir(), 'hyperflow-outside-'));
  try {
    await writeFile(join(outside, 'private.txt'), 'never read');
    await symlink(outside, join(root, 'linked'));
    await link(join(outside, 'private.txt'), join(root, 'hardlinked.txt'));
    for (const scope of [['../private.txt'], ['.env'], ['linked/private.txt'], ['hardlinked.txt']]) {
      await assert.rejects(assembleContext({ repoRoot: root, task: { ...task, readScope: scope }, workflow, dependencyResults: [] }));
    }
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('context omits files beyond its source and total byte bounds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hyperflow-context-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'large.js'), 'x'.repeat(40000));
    await assert.rejects(assembleContext({ repoRoot: root, task, workflow, dependencyResults: [] }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

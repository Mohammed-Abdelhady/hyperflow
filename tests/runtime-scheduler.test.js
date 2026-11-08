import assert from 'node:assert/strict';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { executeWorkflow } from '../runtime/scheduler.mjs';
import { RunStore } from '../runtime/store.mjs';
import { repoFixture } from './runtime-fixtures.mjs';

const TEST_CAPACITY = { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 };
const roles = { revision: 'roles-1', primary: { model: 'p', adapter: 'x' }, general: { model: 'g', adapter: 'x' }, lightweight: { model: 'l', adapter: 'x' } };
const task = (id, dependsOn, writeScope, checks = ['verify']) => ({ id, title: id, agentRole: 'general', dependsOn, readScope: [], writeScope, acceptance: ['the result is valid'], checks });
const workflow = tasks => ({ schemaVersion: 1, id: 'scheduler-fixture', goal: 'exercise scheduler', repository: { root: '', baseSha: '' }, tasks, questions: [], decisions: [] });

const check = { command: process.execPath, args: ['-e', 'process.stdout.write("check evidence")'] };
const reviewPass = async () => ({ verdict: 'pass', findings: [] });

test('independent tasks dispatch together and dependencies wait through integration', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['one.txt']), task('T10', [], ['ten.txt']), task('T02', ['T01'], ['two.txt'])]);
  spec.repository = { root, baseSha };
  const started = [];
  const releases = new Map();
  const adapter = ({ task: item, cwd }) => new Promise(resolve => {
    started.push(item.id);
    releases.set(item.id, async () => {
      await writeFile(path.join(cwd, item.writeScope[0]), item.id);
      resolve({ status: 'completed', summary: item.id });
    });
  });
  const review = async ({ task: item, cwd, baseSha, headSha }) => {
    if (item.id === 'T02') {
      assert.equal(await readFile(path.join(cwd, 'one.txt'), 'utf8'), 'T01');
      const changed = spawnSync('git', ['-C', cwd, 'diff', '--name-only', `${baseSha}..${headSha}`], { encoding: 'utf8' });
      assert.deepEqual(changed.stdout.trim().split('\n'), ['two.txt']);
    }
    return reviewPass();
  };
  const execution = executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, adapter, checks: { verify: check }, review, capacity: { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 } });
  while (started.length < 2) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(new Set(started), new Set(['T01', 'T10']));
  assert.equal(started.includes('T02'), false);
  await releases.get('T01')();
  await releases.get('T10')();
  while (!started.includes('T02')) await new Promise(resolve => setImmediate(resolve));
  await releases.get('T02')();
  const result = await execution;
  assert.equal(result.status, 'completed');
  assert.equal(result.tasks.T02.status, 'completed');
}));

test('overlapping write scopes serialize while disjoint work runs', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['src/shared/file.js']), task('B', [], ['src/shared']), task('C', [], ['docs/readme.md'])]);
  spec.repository = { root, baseSha };
  let beginA;
  let beginC;
  let finishA;
  const aStarted = new Promise(resolve => { beginA = resolve; });
  const cStarted = new Promise(resolve => { beginC = resolve; });
  const aGate = new Promise(resolve => { finishA = resolve; });
  const started = [];
  const adapter = async ({ task: item, cwd }) => {
    started.push(item.id);
    const file = item.id === 'C' ? 'docs/readme.md' : 'src/shared/file.js';
    await import('node:fs/promises').then(fs => fs.mkdir(path.dirname(path.join(cwd, file)), { recursive: true }));
    await writeFile(path.join(cwd, file), item.id);
    if (item.id === 'A') { beginA(); await aGate; }
    if (item.id === 'C') beginC();
    return { status: 'completed' };
  };
  const execution = executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, adapter, checks: { verify: check }, review: reviewPass, capacity: { tasks: 3, availableMemoryBytes: 8 * 1024 ** 3 } });
  await Promise.all([aStarted, cStarted]);
  let overlapError;
  try { assert.deepEqual(new Set(started), new Set(['A', 'C'])); }
  catch (error) { overlapError = error; }
  finally { finishA(); }
  const result = await execution;
  if (overlapError) throw overlapError;
  assert.equal(result.status, 'completed');
  assert.deepEqual(new Set(started), new Set(['A', 'B', 'C']));
}));

test('dirty repository files are preserved and task changes stay in scoped integration', async () => repoFixture(async ({ root, statePath, baseSha, git }) => {
  await writeFile(path.join(root, 'tracked.txt'), 'user work\n');
  const spec = workflow([task('T01', [], ['src/owned.txt'])]);
  spec.repository = { root, baseSha };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ cwd }) => { const { mkdir } = await import('node:fs/promises'); await mkdir(path.join(cwd, 'src'), { recursive: true }); await writeFile(path.join(cwd, 'src/owned.txt'), 'owned'); return { status: 'completed' }; },
    checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(await readFile(path.join(root, 'tracked.txt'), 'utf8'), 'user work\n');
  assert.equal(await readFile(path.join(root, 'src/owned.txt'), 'utf8'), 'owned');
  assert.equal(result.status, 'completed', result.tasks.T01.error);
  const checkReceipt = result.tasks.T01.result.checkEvidence.task[0];
  assert.equal(checkReceipt.exitCode, 0);
  assert.equal(await readFile(checkReceipt.stdoutRef, 'utf8'), 'check evidence');
  assert.ok(result.finalEvidence.checks[0].receipts[0].stdoutRef);
  const status = git(['status', '--short']).split('\n');
  assert.ok(status.includes(' M tracked.txt'));
  assert.ok(status.includes('A  src/owned.txt'));
}));

test('a needs_fix review routes findings to the task owner and caps repairs at two rounds', async () => repoFixture(async ({ root, statePath, baseSha, git }) => {
  const spec = workflow([task('T01', [], ['src/output.txt'])]);
  spec.repository = { root, baseSha };
  const calls = [];
  const adapter = async ({ task: item, cwd, attempt }) => {
    calls.push({ id: item.id, attempt });
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(cwd, 'src'), { recursive: true });
    await writeFile(path.join(cwd, 'src/output.txt'), String(attempt));
    return { status: 'completed' };
  };
  let reviews = 0;
  const review = async ({ task: item, baseSha: reviewBase, headSha, cwd }) => {
    assert.equal(item.id, 'T01');
    assert.notEqual(reviewBase, headSha);
    assert.equal(git(['for-each-ref', '--format=%(objectname)', 'refs/hyperflow/runs']), baseSha);
    await readFile(path.join(cwd, 'src/output.txt'));
    reviews += 1;
    return reviews < 3 ? { verdict: 'needs_fix', findings: [{ path: 'src/output.txt', line: 1, condition: 'value is wrong', impact: 'accepted output is incorrect', evidence: 'observed candidate value', fix: 'write the correct value', severity: 'P1' }] } : { verdict: 'pass', findings: [] };
  };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, adapter, checks: { verify: check }, review, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'completed', result.tasks.T01.error);
  assert.deepEqual(calls.map(call => call.attempt), [1, 2, 3]);
  assert.equal(reviews, 3);
}));

test('execution refuses absent checks and abort prevents late adapter integration', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['late.txt'])]);
  spec.repository = { root, baseSha };
  await assert.rejects(executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async () => ({ status: 'completed' }), checks: {}, review: reviewPass }), /check/i);

  const controller = new AbortController();
  let finish;
  const execution = executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath: path.join(root, 'second.sqlite'), roles,
    adapter: () => new Promise(resolve => { finish = resolve; }), checks: { verify: check }, review: reviewPass, signal: controller.signal, capacity: TEST_CAPACITY });
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await new Promise(resolve => setImmediate(resolve));
  finish({ status: 'completed' });
  const result = await execution;
  assert.equal(result.status, 'stopped');
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'late.txt')).then(() => true, () => false)), false);
}));

test('a failed lane blocks only dependents and unrelated ready work still completes', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['a.txt']), task('B', ['A'], ['b.txt']), task('C', [], ['c.txt'])]);
  spec.repository = { root, baseSha };
  const started = [];
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd }) => {
      started.push(item.id);
      if (item.id === 'A') throw new Error('lane failed');
      await writeFile(path.join(cwd, item.writeScope[0]), item.id);
      return { status: 'completed' };
    }, checks: { verify: check }, review: reviewPass, capacity: { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 } });
  assert.deepEqual(new Set(started), new Set(['A', 'C']));
  assert.equal(result.tasks.B.status, 'blocked');
  assert.equal(result.tasks.C.status, 'completed');
  assert.equal(result.status, 'failed');
}));

test('a second execution on the same repository is rejected while one run owns integration', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['a.txt'])]);
  spec.repository = { root, baseSha };
  let release;
  const first = executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: ({ cwd }) => new Promise(resolve => { release = async result => { await writeFile(path.join(cwd, 'a.txt'), 'created'); resolve(result); }; }), checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const second = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async () => ({ status: 'completed' }), checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(second.status, 'failed');
  release({ status: 'completed' });
  assert.equal((await first).status, 'completed');
}));


test('a persisted stop signals active work and fences its late result', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['late.txt'])]);
  spec.repository = { root, baseSha };
  let signalWork;
  let resolveWork;
  const started = new Promise(resolve => { signalWork = resolve; });
  const execution = executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: ({ cwd, signal }) => new Promise(resolve => {
      resolveWork = resolve;
      signal.addEventListener('abort', () => resolve({ status: 'completed' }), { once: true });
      signalWork(cwd);
    }), checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  await started;
  const observer = new RunStore(statePath);
  const runId = observer.listRuns()[0].runId;
  observer.stop(runId);
  observer.close();
  const result = await execution;
  assert.equal(result.status, 'stopped');
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'late.txt')).then(() => true, () => false)), false);
  assert.ok(resolveWork);
}));

test('a failed run resumes the same workflow and retains its run identity', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['accepted.txt']), task('B', [], ['resumed.txt'])]);
  spec.repository = { root, baseSha };
  const failed = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd }) => { if (item.id === 'B') throw new Error('transient adapter failure'); await writeFile(path.join(cwd, 'accepted.txt'), 'kept'); return { status: 'completed' }; }, checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.tasks.A.status, 'completed');
  const resumed = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, runId: failed.runId,
    adapter: async ({ cwd }) => { await writeFile(path.join(cwd, 'resumed.txt'), 'recovered'); return { status: 'completed' }; },
    checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(resumed.runId, failed.runId);
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.tasks.A.status, 'completed');
  assert.equal(await readFile(path.join(root, 'accepted.txt'), 'utf8'), 'kept');
}));

test('review repair stops after the initial attempt and two correction rounds', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['repair.txt'])]);
  spec.repository = { root, baseSha };
  let attempts = 0;
  let reviews = 0;
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ cwd }) => { attempts += 1; await writeFile(path.join(cwd, 'repair.txt'), String(attempts)); return { status: 'completed' }; },
    checks: { verify: check }, review: async () => { reviews += 1; return { verdict: 'needs_fix', findings: [{ path: 'repair.txt', line: 1, condition: 'value remains wrong', impact: 'task cannot pass', evidence: 'reviewed candidate', fix: 'correct the value', severity: 'P1' }] }; }, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.equal(attempts, 3);
  assert.equal(reviews, 3);
}));


test('out-of-scope task changes never reach the repository', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['owned.txt'])]);
  spec.repository = { root, baseSha };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ cwd }) => { await writeFile(path.join(cwd, 'outside.txt'), 'forbidden'); return { status: 'completed' }; },
    checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'outside.txt')).then(() => true, () => false)), false);
}));

test('unavailable browser capacity blocks only the task that requests it', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const browser = { ...task('browser', [], ['browser.txt']), resources: { browserSpaces: 1 } };
  const independent = task('plain', [], ['plain.txt']);
  const spec = workflow([browser, independent]);
  spec.repository = { root, baseSha };
  const started = [];
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd }) => { started.push(item.id); await writeFile(path.join(cwd, item.writeScope[0]), item.id); return { status: 'completed' }; },
    checks: { verify: check }, review: reviewPass, capacity: { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 } });
  assert.deepEqual(started, ['plain']);
  assert.equal(result.tasks.browser.status, 'blocked');
  assert.equal(result.tasks.plain.status, 'completed');
  assert.equal(result.status, 'failed');
}));

test('a custom sole profile is valid and task effort reaches adapter and fresh reviewer', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([{ ...task('A', [], ['effort.txt']), agentRole: 'openai/gpt-6.1-sol', effort: 'high', reviewEffort: 'low' }]);
  spec.repository = { root, baseSha };
  const profiles = { revision: 'custom-r1', roles: { 'openai/gpt-6.1-sol': { model: 'gpt-6.1-sol', adapter: 'codex' } } };
  let adapterEffort;
  let reviewEffort;
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles: profiles,
    adapter: async ({ cwd, effort }) => { adapterEffort = effort; await writeFile(path.join(cwd, 'effort.txt'), effort); return { status: 'completed' }; },
    checks: { verify: check }, review: async ({ effort, model }) => { reviewEffort = effort; assert.equal(model.model, 'gpt-6.1-sol'); return { verdict: 'pass', findings: [] }; }, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'completed');
  assert.equal(adapterEffort, 'high');
  assert.equal(reviewEffort, 'low');
}));



test('failed checks retain their exact exit code and output references', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['a.txt'])]);
  spec.repository = { root, baseSha };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ cwd }) => { await writeFile(path.join(cwd, 'a.txt'), 'candidate'); return { status: 'completed' }; },
    checks: { verify: { command: process.execPath, args: ['-e', 'process.stdout.write("failed output"); process.exit(2)'] } },
    review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.equal(result.tasks.A.evidence.exitCode, 2);
  assert.equal(await readFile(result.tasks.A.evidence.stdoutRef, 'utf8'), 'failed output');
}));


test('a write scope cannot follow a repository symlink outside the task tree', async () => repoFixture(async ({ root, statePath, git }) => {
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, path.join(root, 'external-link'));
  git(['add', 'external-link']);
  git(['commit', '-qm', 'add symlink fixture']);
  const baseSha = git(['rev-parse', 'HEAD']);
  const spec = workflow([task('A', [], ['external-link/escaped.txt'])]);
  spec.repository = { root, baseSha };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ cwd }) => { await writeFile(path.join(cwd, 'external-link/escaped.txt'), 'escaped'); return { status: 'completed' }; },
    checks: { verify: check }, review: reviewPass, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(outside, 'escaped.txt')).then(() => true, () => false)), false);
}));

test('a contradictory pass cannot contaminate another lane candidate', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('A', [], ['a.txt']), task('B', [], ['b.txt'])]);
  spec.repository = { root, baseSha };
  let markAReviewed;
  const aReviewed = new Promise(resolve => { markAReviewed = resolve; });
  const adapter = async ({ task: item, cwd }) => {
    if (item.id === 'B') await aReviewed;
    await writeFile(path.join(cwd, `${item.id.toLowerCase()}.txt`), item.id);
    return { status: 'completed' };
  };
  const review = async ({ task: item, cwd }) => {
    if (item.id === 'A') {
      markAReviewed();
      return { verdict: 'pass', findings: [{ path: 'a.txt', line: 1, condition: 'bad', impact: 'bad', evidence: 'bad', fix: 'fix', severity: 'P1' }] };
    }
    assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(cwd, 'a.txt')).then(() => true, () => false)), false);
    return { verdict: 'pass', findings: [] };
  };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, adapter,
    checks: { verify: check }, review, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.equal(result.tasks.A.status, 'failed');
  assert.equal(result.tasks.B.status, 'completed');
}));

test('a stop during review prevents a late passing verdict from advancing integration', async () => repoFixture(async ({ root, statePath, baseSha, git }) => {
  const spec = workflow([task('A', [], ['a.txt'])]);
  spec.repository = { root, baseSha };
  const controller = new AbortController();
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, signal: controller.signal,
    adapter: async ({ cwd }) => { await writeFile(path.join(cwd, 'a.txt'), 'candidate'); return { status: 'completed' }; },
    checks: { verify: check }, review: async () => { controller.abort(); return { verdict: 'pass', findings: [] }; }, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'stopped');
  assert.equal(git(['for-each-ref', '--format=%(objectname)', 'refs/hyperflow/runs']), baseSha);
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'a.txt')).then(() => true, () => false)), false);
}));

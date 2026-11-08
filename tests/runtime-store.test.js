import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, watch, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeWorkflow } from '../runtime/scheduler.mjs';
import { spawn } from 'node:child_process';
import { acquireRepositoryLock, applyIntegratedChanges, createExecutionWorktree, git as runtimeGit } from '../runtime/worktrees.mjs';
import { repoFixture } from './runtime-fixtures.mjs';
import test from 'node:test';
import { RunStore } from '../runtime/store.mjs';

const workflow = {
  schemaVersion: 1, id: 'store-fixture', goal: 'test persistence',
  repository: { root: '/repo', baseSha: 'abc123' },
  tasks: [
    { id: 'T01', title: 'write', agentRole: 'general', dependsOn: [], readScope: [], writeScope: ['src/a.js'], acceptance: ['write'], checks: [] },
    { id: 'T10', title: 'other', agentRole: 'lightweight', dependsOn: [], readScope: [], writeScope: ['docs/a.md'], acceptance: ['document'], checks: [] }
  ], questions: [], decisions: []
};
const roles = { revision: 'r1', primary: { model: 'p', adapter: 'a' }, general: { model: 'g', adapter: 'a' }, lightweight: { model: 'l', adapter: 'a' } };
const testCapacity = { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 };
const executionTask = (id, file) => ({ id, title: id, agentRole: 'general', dependsOn: [], readScope: [], writeScope: [file], acceptance: ['valid output'], checks: ['verify'] });
const executionWorkflow = (root, baseSha, tasks) => ({ schemaVersion: 1, id: 'store-execution', goal: 'verify finalization', repository: { root, baseSha }, tasks, questions: [], decisions: [] });
const passingReview = async () => ({ verdict: 'pass', findings: [] });
const passingCheck = { command: process.execPath, args: ['-e', 'process.exit(0)'] };

async function fixture(callback) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hyperflow-store-'));
  const dbPath = path.join(directory, 'state.sqlite');
  try { await callback({ directory, dbPath }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('RunStore persists a run, rename, and typed task messages across reopen', async () => fixture(async ({ dbPath }) => {
  const store = new RunStore(dbPath);
  const created = store.createRun({ workflow, digest: 'digest-1', repoRoot: '/repo', roles });
  store.rename(created.runId, 'night shift');
  store.sendMessage(created.runId, { fromTaskId: 'T01', toTaskId: 'T10', type: 'finding', payload: { file: 'src/a.js' } });
  store.close();

  const reopened = new RunStore(dbPath);
  const run = reopened.getRun(created.runId);
  assert.equal(run.workflow.id, 'store-fixture');
  assert.equal(run.label, 'night shift');
  assert.equal(run.tasks.T01.status, 'queued');
  assert.deepEqual(reopened.messages(created.runId).map(item => item.payload), [{ file: 'src/a.js' }]);
  reopened.close();
}));

test('RunStore lists runs newest first and fences claims after stop', async () => fixture(async ({ dbPath }) => {
  const store = new RunStore(dbPath);
  const first = store.createRun({ workflow, digest: 'digest-1', repoRoot: '/repo', roles });
  const second = store.createRun({ workflow, digest: 'digest-2', repoRoot: '/repo', roles });
  assert.deepEqual(store.listRuns().map(run => run.runId), [second.runId, first.runId]);

  const lease = store.claimTask(first.runId, 'T01', 'worker-a');
  assert.ok(lease);
  const stopped = store.stop(first.runId);
  assert.equal(stopped.status, 'stopped');
  assert.equal(store.claimTask(first.runId, 'T10', 'worker-b'), null);
  assert.equal(store.completeTask(first.runId, 'T01', lease.token, { status: 'completed' }), false);
  store.close();
}));

test('separate processes cannot claim the same task lease', async () => fixture(async ({ directory, dbPath }) => {
  const store = new RunStore(dbPath);
  const { runId } = store.createRun({ workflow, digest: 'digest-1', repoRoot: '/repo', roles });
  store.close();
  const moduleUrl = new URL('../runtime/store.mjs', import.meta.url).href;
  const script = `import { RunStore } from ${JSON.stringify(moduleUrl)}; const store = new RunStore(process.argv[1]); const runId = process.argv[2]; const lease = store.claimTask(runId, 'T01', process.argv[3]); process.stdout.write(lease ? 'claimed' : 'busy'); store.close();`;
  const launch = owner => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, dbPath, runId, owner], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
  assert.deepEqual((await Promise.all([launch('one'), launch('two')])).sort(), ['busy', 'claimed']);
}));

test('role revisions update queued work config and resume keeps completed work', async () => fixture(async ({ dbPath }) => {
  const store = new RunStore(dbPath);
  const { runId } = store.createRun({ workflow, digest: 'digest-1', repoRoot: '/repo', roles });
  const lease = store.claimTask(runId, 'T01', 'worker-a');
  assert.equal(store.completeTask(runId, 'T01', lease.token, { status: 'completed' }), true);
  const replacement = { revision: 'r2', roles: { primary: { model: 'p2', adapter: 'a' }, general: { model: 'g2', adapter: 'a' }, lightweight: { model: 'l2', adapter: 'a' } } };
  store.setRoles(runId, replacement);
  const staleLease = store.claimTask(runId, 'T10', 'worker-old');
  store.stop(runId);
  const resumed = store.resumeRun(runId, { workflow, digest: 'digest-1', repoRoot: '/repo' });
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.tasks.T01.status, 'completed');
  assert.equal(resumed.tasks.T10.status, 'queued');
  assert.equal(store.completeTask(runId, 'T10', staleLease.token, { status: 'completed' }), false);
  assert.equal(resumed.roleRevision, 'r2');
  assert.equal(resumed.roles.general.model, 'g2');
  store.close();
}));


test('task completion and integration head survive a process reopen together', async () => fixture(async ({ dbPath }) => {
  const store = new RunStore(dbPath);
  const { runId } = store.createRun({ workflow, digest: 'digest-1', repoRoot: '/repo', roles });
  const lease = store.claimTask(runId, 'T01', 'worker-a');
  assert.equal(store.completeTask(runId, 'T01', lease.token, { status: 'completed', integrationHead: 'candidate-sha' }), true);
  store.close();
  const reopened = new RunStore(dbPath);
  const run = reopened.getRun(runId);
  assert.equal(run.tasks.T01.status, 'completed');
  assert.equal(run.integrationHead, 'candidate-sha');
  reopened.close();
}));

test('two child processes contend for the repository lock without splitting ownership', async () => repoFixture(async ({ root }) => {
  const moduleUrl = new URL('../runtime/worktrees.mjs', import.meta.url).href;
  const script = `import { acquireRepositoryLock } from ${JSON.stringify(moduleUrl)}; try { const release = await acquireRepositoryLock(process.argv[1], process.argv[2]); process.stdout.write('acquired'); process.stdin.once('data', async () => { await release(); process.exit(0); }); } catch { process.stdout.write('busy'); process.exit(0); }`;
  const children = ['one', 'two'].map(owner => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, root, owner], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
    return { child, output: () => output, ready: new Promise(resolve => child.stdout.once('data', () => resolve())), closed: new Promise(resolve => child.once('close', resolve)) };
  });
  await Promise.all(children.map(item => item.ready));
  const results = children.map(item => item.output().trim());
  assert.deepEqual(results.sort(), ['acquired', 'busy']);
  const winner = children.find(item => item.output().trim() === 'acquired');
  winner.child.stdin.end('release');
  await Promise.all(children.map(item => item.closed));
  await acquireRepositoryLock(root, 'after-release').then(release => release());
}));




test('dirty ancestor paths are rejected without changing the existing file', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const target = path.join(root, 'target');
  await writeFile(target, 'user file');
  const workflow = executionWorkflow(root, baseSha, [executionTask('A', 'target/child.txt')]);
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ cwd }) => { await mkdir(path.join(cwd, 'target'), { recursive: true }); await writeFile(path.join(cwd, 'target/child.txt'), 'candidate'); return { status: 'completed' }; },
    checks: { verify: passingCheck }, review: passingReview });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /overlap/i);
  assert.equal(await readFile(target, 'utf8'), 'user file');
}));

test('a root symlink ignored by Git cannot redirect integrated files outside the repository', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(root, '.gitignore'), 'ignored\n');
  await symlink(outside, path.join(root, 'ignored'));
  const workflow = executionWorkflow(root, baseSha, [executionTask('A', 'ignored/new.txt')]);
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ cwd }) => { await mkdir(path.join(cwd, 'ignored'), { recursive: true }); await writeFile(path.join(cwd, 'ignored/new.txt'), 'candidate'); return { status: 'completed' }; },
    checks: { verify: passingCheck }, review: passingReview });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /symlink/i);
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(outside, 'new.txt')).then(() => true, () => false)), false);
}));

test('repository HEAD movement after approval blocks integration and preserves the new commit', async () => repoFixture(async ({ root, statePath, baseSha, git }) => {
  const workflow = executionWorkflow(root, baseSha, [executionTask('A', 'new.txt')]);
  let newHead;
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ cwd }) => {
      await writeFile(path.join(root, 'tracked.txt'), 'new user commit\n');
      git(['add', 'tracked.txt']);
      git(['commit', '-qm', 'user change']);
      newHead = git(['rev-parse', 'HEAD']);
      await writeFile(path.join(cwd, 'new.txt'), 'candidate');
      return { status: 'completed' };
    }, checks: { verify: passingCheck }, review: passingReview });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /HEAD changed/i);
  assert.equal(git(['rev-parse', 'HEAD']), newHead);
  assert.equal(await readFile(path.join(root, 'tracked.txt'), 'utf8'), 'new user commit\n');
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'new.txt')).then(() => true, () => false)), false);
}));

test('stop after final patch generation prevents applying the candidate tree', async () => repoFixture(async ({ root, baseSha }) => {
  const candidate = await createExecutionWorktree(root, baseSha);
  try {
    await writeFile(path.join(candidate.path, 'candidate.txt'), 'approved candidate\n');
    await runtimeGit(candidate.path, ['add', 'candidate.txt']);
    await runtimeGit(candidate.path, ['commit', '-m', 'feat: add candidate']);
    let checks = 0;
    const signal = { get aborted() { checks += 1; return checks >= 3; }, reason: new Error('Run stopped') };
    await assert.rejects(applyIntegratedChanges(candidate.path, root, baseSha, [], signal), /Run stopped/);
    assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'candidate.txt')).then(() => true, () => false)), false);
  } finally { await candidate.cleanup(); }
}));

test('failed candidate checks send exact evidence to the owner for same-worktree repair before review', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const workflow = executionWorkflow(root, baseSha, [executionTask('A', 'result.txt')]);
  const check = { command: process.execPath, args: ['-e', "import { readFileSync } from 'node:fs'; process.exit(readFileSync('result.txt', 'utf8') === 'fixed' ? 0 : 7);"] };
  const worktrees = [];
  let adapterCalls = 0;
  let reviewCalls = 0;
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ cwd, context }) => {
      adapterCalls += 1;
      worktrees.push(cwd);
      if (adapterCalls === 1) await writeFile(path.join(cwd, 'result.txt'), 'broken');
      else {
        const failure = context?.verificationFailure;
        assert.ok(failure);
        assert.equal(failure.command, process.execPath);
        assert.deepEqual(failure.args, check.args);
        assert.equal(failure.exitCode, 7);
        assert.ok(failure.stdoutRef && failure.stderrRef);
        await writeFile(path.join(cwd, 'result.txt'), 'fixed');
      }
      return { status: 'completed' };
    }, checks: { verify: check }, review: async ({ cwd }) => {
      reviewCalls += 1;
      assert.equal(await readFile(path.join(cwd, 'result.txt'), 'utf8'), 'fixed');
      return passingReview();
    } });
  assert.equal(result.status, 'completed');
  assert.equal(adapterCalls, 2);
  assert.equal(reviewCalls, 1);
  assert.equal(worktrees[0], worktrees[1]);
  assert.equal(await readFile(path.join(root, 'result.txt'), 'utf8'), 'fixed');
}));

test('failed checks on the latest merged candidate route evidence to owner repair', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const workflow = executionWorkflow(root, baseSha, [
    { ...executionTask('A', 'a'), checks: ['verifyA'] },
    { ...executionTask('B', 'b'), checks: ['verifyB'] }
  ]);
  let startedA;
  let reviewedB;
  const aReady = new Promise(resolve => { startedA = resolve; });
  const bReady = new Promise(resolve => { reviewedB = resolve; });
  const combinedCheck = { command: process.execPath, args: ['-e', "import { existsSync } from 'node:fs'; process.exit(existsSync('b/conflict.txt') && !existsSync('a/override.txt') ? 8 : 0);"] };
  let aCalls = 0;
  const reviewed = [];
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ task, cwd, context }) => {
      if (task.id === 'B') { await aReady; await mkdir(path.join(cwd, 'b'), { recursive: true }); await writeFile(path.join(cwd, 'b/conflict.txt'), 'merged'); }
      else {
        aCalls += 1;
        if (aCalls === 1) { startedA(); await bReady; await mkdir(path.join(cwd, 'a'), { recursive: true }); await writeFile(path.join(cwd, 'a/result.txt'), 'isolated'); }
        else { assert.equal(context?.verificationFailure?.exitCode, 8); await writeFile(path.join(cwd, 'a/override.txt'), 'repair'); }
      }
      return { status: 'completed' };
    }, checks: { verifyA: combinedCheck, verifyB: passingCheck }, review: async ({ task }) => {
      reviewed.push(task.id);
      if (task.id === 'B') reviewedB();
      return passingReview();
    } });
  assert.equal(result.status, 'completed');
  assert.equal(aCalls, 2);
  assert.deepEqual(reviewed, ['B', 'A']);
  assert.equal(await readFile(path.join(root, 'a/override.txt'), 'utf8'), 'repair');
  assert.equal(await readFile(path.join(root, 'b/conflict.txt'), 'utf8'), 'merged');
}));

test('check launch errors without an exit receipt are not sent for owner repair', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const workflow = executionWorkflow(root, baseSha, [executionTask('A', 'result.txt')]);
  let adapterCalls = 0;
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ cwd }) => { adapterCalls += 1; await writeFile(path.join(cwd, 'result.txt'), 'candidate'); return { status: 'completed' }; },
    checks: { verify: { command: path.join(root, 'missing-check'), args: [] } }, review: passingReview });
  assert.equal(result.status, 'failed');
  assert.equal(adapterCalls, 1);
  assert.match(result.tasks.A.error, /ENOENT/);
}));

test('exhausted check repair blocks dependents while unrelated tasks complete', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const workflow = executionWorkflow(root, baseSha, [
    { ...executionTask('A', 'bad/result.txt'), checks: ['verifyA'] },
    { ...executionTask('B', 'good/result.txt'), checks: ['verifyB'] },
    { ...executionTask('C', 'later/result.txt'), dependsOn: ['A'] }
  ]);
  const check = file => ({ command: process.execPath, args: ['-e', "import { readFileSync } from 'node:fs'; process.exit(readFileSync(process.argv[1], 'utf8') === 'fixed' ? 0 : 9);", file] });
  const calls = { A: 0, B: 0, C: 0 };
  const reviewed = [];
  const result = await executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity,
    adapter: async ({ task, cwd }) => {
      calls[task.id] += 1;
      const file = `${task.id === 'A' ? 'bad' : task.id === 'B' ? 'good' : 'later'}/result.txt`;
      await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
      await writeFile(path.join(cwd, file), task.id === 'A' ? 'broken' : 'fixed');
      return { status: 'completed' };
    }, checks: { verifyA: check('bad/result.txt'), verifyB: check('good/result.txt'), verify: check('later/result.txt') }, review: async ({ task }) => {
      reviewed.push(task.id);
      return passingReview();
    } });
  assert.equal(result.status, 'failed');
  assert.equal(result.tasks.A.status, 'failed');
  assert.equal(result.tasks.B.status, 'completed');
  assert.equal(result.tasks.C.status, 'blocked');
  assert.deepEqual(calls, { A: 3, B: 1, C: 0 });
  assert.deepEqual(reviewed, ['B']);
  assert.deepEqual(result.tasks.B.result.paths, ['good/result.txt']);
  assert.equal(await import('node:fs/promises').then(fs => fs.access(path.join(root, 'bad/result.txt')).then(() => true, () => false)), false);
}));

test('stop during blocked final checks leaves the run resumable with completed tasks', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const workflow = executionWorkflow(root, baseSha, [executionTask('A', 'a.txt')]);
  const counter = path.join(root, 'check-count');
  const marker = `${counter}.blocked`;
  const checkScript = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'; const p=process.argv[1]; const n=existsSync(p)?readFileSync(p,'utf8').length+1:1; appendFileSync(p,'x'); if(n===3){writeFileSync(p+'.blocked','1'); process.on('SIGTERM',()=>process.exit(143)); setInterval(()=>{},1000);}`;
  const checks = { verify: { command: process.execPath, args: ['-e', checkScript, counter] } };
  const watcher = watch(root);
  const markerReady = (async () => { for await (const event of watcher) if (event.filename === path.basename(marker)) return; })();
  const controller = new AbortController();
  const execute = options => executeWorkflow({ workflow, digest: 'd1', repoRoot: root, statePath, roles, capacity: testCapacity, signal: controller.signal,
    adapter: async ({ cwd }) => { await writeFile(path.join(cwd, 'a.txt'), 'candidate'); return { status: 'completed' }; }, checks, review: passingReview, ...options });
  let finalized = false;
  try {
    const firstExecution = execute();
    await markerReady;
    const observer = new RunStore(statePath);
    const activeRun = observer.listRuns()[0];
    assert.equal(activeRun.status, 'running');
    assert.equal(activeRun.tasks.A.status, 'completed');
    observer.stop(activeRun.runId);
    observer.close();
    const stopped = await firstExecution;
    assert.equal(stopped.status, 'stopped');
    const resumed = await execute({ runId: stopped.runId });
    assert.equal(resumed.status, 'completed');
    assert.equal(resumed.tasks.A.status, 'completed');
    finalized = true;
  } finally {
    await watcher.return();
    if (!finalized) controller.abort();
  }
}));

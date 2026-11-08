import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { executeWorkflow } from '../runtime/scheduler.mjs';
import { RunStore } from '../runtime/store.mjs';
import { repoFixture } from './runtime-fixtures.mjs';

const TEST_CAPACITY = { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 };
const roles = { revision: 'roles-1', primary: { model: 'p', adapter: 'x' }, general: { model: 'g', adapter: 'x' }, lightweight: { model: 'l', adapter: 'x' } };
const task = (id, dependsOn, writeScope, checks = ['verify'], extra = {}) => ({ id, title: id, details: `Implement ${id} exactly as planned.`, difficulty: 'complex',
  agentRole: 'general', effort: 'high', reviewRole: 'primary', reviewEffort: 'high', dependsOn, readScope: [], writeScope,
  acceptance: ['the result is valid'], checks, ...extra });
const workflow = (tasks, extra = {}) => ({ schemaVersion: 2, id: 'security-gate-fixture', goal: 'exercise the final security gate',
  repository: { root: '', baseSha: '' }, securityReviewEffort: 'high', securityFixEffort: 'high', tasks, questions: [], decisions: [], ...extra });
const check = { command: process.execPath, args: ['-e', 'process.stdout.write("check evidence")'] };
const passReview = async () => ({ verdict: 'pass', findings: [] });
const findingOn = file => ({ path: file, line: 1, condition: 'the value is unsafe', impact: 'the workflow ships a security defect',
  evidence: 'the reviewed candidate contains the unsafe value', fix: 'write the hardened value', severity: 'high' });

test('one consolidated security review runs after every task and its primary review complete', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['t1.txt']), task('T02', ['T01'], ['t2.txt'])]);
  spec.repository = { root, baseSha };
  const calls = [];
  const review = async ({ task: item, phase, baseSha: reviewBase, headSha, model, effort, cwd }) => {
    calls.push({ id: item.id, phase, reviewBase, headSha, model: model.model, effort, cwd });
    return passReview();
  };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd, model }) => { await writeFile(path.join(cwd, item.writeScope[0]), `${item.id} done`); assert.equal(model.model, 'g'); return { status: 'completed' }; },
    checks: { verify: check }, review, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'completed', result.tasks.T01.error ?? result.tasks.T02.error ?? result.error);
  const phases = calls.map(call => call.phase);
  assert.deepEqual(phases, ['correctness-review', 'correctness-review', 'security-review']);
  const security = calls[2];
  assert.equal(security.id, 'security-review');
  assert.equal(security.reviewBase, baseSha);
  assert.equal(security.model, 'g');
  assert.equal(security.effort, 'high');
  assert.equal(calls.filter(call => call.phase === 'security-review').length, 1);
  assert.equal(security.headSha, result.finalEvidence.integrationHead);
  assert.notEqual(security.headSha, baseSha);
  assert.equal(result.finalEvidence.security.verdict, 'pass');
  assert.equal(await readFile(path.join(root, 't1.txt'), 'utf8'), 'T01 done');
  const lanes = calls.map(call => call.cwd);
  assert.equal(new Set(lanes).size, lanes.length);
}));

test('routine work runs on lightweight while primary reviews and one general security review keep their own efforts', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['t1.txt'], ['verify'], { difficulty: 'routine', agentRole: 'lightweight', effort: 'low' })],
    { securityReviewEffort: 'medium' });
  spec.repository = { root, baseSha };
  const seen = [];
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd, model, effort }) => { seen.push(['adapter', item.id, model.model, effort]); await writeFile(path.join(cwd, item.writeScope[0]), item.id); return { status: 'completed' }; },
    checks: { verify: check }, review: async ({ phase, model, effort, task: item }) => { seen.push([phase, item.id, model.model, effort]); return passReview(); },
    capacity: TEST_CAPACITY });
  assert.equal(result.status, 'completed', result.error);
  assert.deepEqual(seen, [['adapter', 'T01', 'l', 'low'], ['correctness-review', 'T01', 'p', 'high'], ['security-review', 'security-review', 'g', 'medium']]);
}));

test('security findings are repaired by a fresh general lane, rechecked, primary reviewed and revalidated', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['t1.txt']), task('T02', ['T01'], ['t2.txt'])]);
  spec.repository = { root, baseSha };
  const calls = [];
  const reviewPaths = [];
  const adapter = async ({ task: item, cwd, model, effort, context }) => {
    calls.push({ kind: 'adapter', id: item.id, model: model.model, effort, context, scope: item.writeScope, cwd });
    if (item.id === 'security-fix') {
      assert.match(context, /the reviewed candidate contains the unsafe value/);
      await writeFile(path.join(cwd, 't1.txt'), 'T01 hardened');
      return { status: 'completed' };
    }
    await writeFile(path.join(cwd, item.writeScope[0]), item.id);
    return { status: 'completed' };
  };
  const review = async ({ task: item, phase, headSha, cwd }) => {
    reviewPaths.push(cwd);
    calls.push({ kind: 'review', id: item.id, phase, headSha });
    if (phase === 'security-review' && calls.filter(call => call.phase === 'security-review').length === 1) {
      return { verdict: 'needs_fix', findings: [findingOn('t1.txt')] };
    }
    return passReview();
  };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles, adapter,
    checks: { verify: check }, review, capacity: TEST_CAPACITY });
  assert.equal(result.status, 'completed', result.error ?? result.tasks.T01.error);
  const securityReviews = calls.filter(call => call.phase === 'security-review');
  assert.equal(securityReviews.length, 2);
  assert.notEqual(securityReviews[0].headSha, securityReviews[1].headSha);
  const fix = calls.find(call => call.id === 'security-fix' && call.kind === 'adapter');
  assert.equal(fix.model, 'g');
  assert.equal(fix.effort, 'high');
  assert.deepEqual(fix.scope, ['t1.txt', 't2.txt']);
  const fixReview = calls.find(call => call.id === 'security-fix' && call.kind === 'review');
  assert.equal(fixReview.phase, 'correctness-review');
  assert.equal(fixReview.headSha, securityReviews[1].headSha);
  assert.equal(new Set(reviewPaths).size, reviewPaths.length);
  assert.equal(await readFile(path.join(root, 't1.txt'), 'utf8'), 'T01 hardened');
  const evidence = result.finalEvidence.security;
  assert.equal(evidence.verdict, 'pass');
  assert.equal(evidence.reviews.length, 2);
  assert.equal(evidence.fixes.length, 1);
  assert.equal(evidence.fixes[0].task, 'security-fix');
  assert.equal(evidence.fixes[0].role, 'general');
  assert.equal(evidence.fixes[0].review.phase, 'correctness-review');
  assert.ok(evidence.fixes[0].checks[0].stdoutRef);
  const observer = new RunStore(statePath);
  const run = observer.listRuns()[0];
  observer.close();
  assert.equal(run.integrationHead, evidence.integrationHead);
}));

test('a blocked consolidated security review never applies changes', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['t1.txt'])]);
  spec.repository = { root, baseSha };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd }) => { await writeFile(path.join(cwd, item.writeScope[0]), item.id); return { status: 'completed' }; },
    checks: { verify: check }, review: async ({ phase }) => phase === 'security-review'
      ? { verdict: 'blocked', findings: [], reason: 'candidate too large to review' } : passReview(),
    capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /blocked|security/i);
  assert.equal(result.finalEvidence.security.verdict, 'blocked');
  assert.equal(result.finalEvidence.security.reviews.at(-1).verdict, 'blocked');
  assert.equal(result.finalEvidence.security.reviews.at(-1).reason, 'candidate too large to review');
  assert.equal(await readFile(path.join(root, 'tracked.txt'), 'utf8'), 'baseline\n');
  await assert.rejects(readFile(path.join(root, 't1.txt')));
}));

test('contradictory, mutating and aborted security verdicts cannot apply', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = () => { const value = workflow([task('T01', [], ['t1.txt'])]); value.repository = { root, baseSha }; return value; };
  const adapter = async ({ task: item, cwd }) => { await writeFile(path.join(cwd, item.writeScope[0]), item.id); return { status: 'completed' }; };
  const contradictory = await executeWorkflow({ workflow: spec(), digest: 'approved', repoRoot: root, statePath, roles, adapter,
    checks: { verify: check }, review: async ({ phase }) => phase === 'security-review'
      ? { verdict: 'pass', findings: [findingOn('t1.txt')] } : passReview(), capacity: TEST_CAPACITY });
  assert.equal(contradictory.status, 'failed');
  await assert.rejects(readFile(path.join(root, 't1.txt')));

  const mutating = await executeWorkflow({ workflow: spec(), digest: 'approved', repoRoot: root, statePath: path.join(root, 'second.sqlite'), roles, adapter,
    checks: { verify: check }, review: async ({ phase, cwd }) => {
      if (phase === 'security-review') await writeFile(path.join(cwd, 'mutation.txt'), 'reviewer write');
      return passReview();
    }, capacity: TEST_CAPACITY });
  assert.equal(mutating.status, 'failed');
  await assert.rejects(readFile(path.join(root, 'mutation.txt')));

  const controller = new AbortController();
  const aborted = await executeWorkflow({ workflow: spec(), digest: 'approved', repoRoot: root, statePath: path.join(root, 'third.sqlite'), roles, adapter,
    checks: { verify: check }, signal: controller.signal, review: async ({ phase }) => {
      if (phase === 'security-review') controller.abort();
      return passReview();
    }, capacity: TEST_CAPACITY });
  assert.equal(aborted.status, 'stopped');
  await assert.rejects(readFile(path.join(root, 't1.txt')));
}));

test('security repairs stay capped at the existing two rounds', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['t1.txt'])]);
  spec.repository = { root, baseSha };
  const fixDispatches = [];
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd, attempt }) => {
      if (item.id === 'security-fix') { fixDispatches.push(item.writeScope); await writeFile(path.join(cwd, 't1.txt'), `hardened ${attempt}`); return { status: 'completed' }; }
      await writeFile(path.join(cwd, item.writeScope[0]), item.id);
      return { status: 'completed' };
    },
    checks: { verify: check }, review: async ({ phase }) => phase === 'security-review'
      ? { verdict: 'needs_fix', findings: [findingOn('t1.txt')] } : passReview(),
    capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.match(result.error, /repair limit/i);
  assert.equal(fixDispatches.length, 2);
  await assert.rejects(readFile(path.join(root, 't1.txt')));
}));

test('security repairs outside the union of approved scopes are rejected', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow([task('T01', [], ['t1.txt'])]);
  spec.repository = { root, baseSha };
  const result = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles,
    adapter: async ({ task: item, cwd }) => {
      if (item.id === 'security-fix') { await writeFile(path.join(cwd, 'outside.txt'), 'forbidden'); return { status: 'completed' }; }
      await writeFile(path.join(cwd, item.writeScope[0]), item.id);
      return { status: 'completed' };
    },
    checks: { verify: check }, review: async ({ phase }) => phase === 'security-review'
      ? { verdict: 'needs_fix', findings: [findingOn('t1.txt')] } : passReview(),
    capacity: TEST_CAPACITY });
  assert.equal(result.status, 'failed');
  assert.match(result.tasks.T01.error ?? result.error, /outside/i);
  await assert.rejects(readFile(path.join(root, 'outside.txt')));
  await assert.rejects(readFile(path.join(root, 't1.txt')));
}));

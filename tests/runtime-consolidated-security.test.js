import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { executeWorkflow } from '../runtime/scheduler.mjs';
import { repoFixture } from './runtime-fixtures.mjs';

const ROLES = { revision: 'policy-fixture', roles: {
  primary: { model: 'primary-model', adapter: 'fixture' },
  general: { model: 'general-model', adapter: 'fixture' },
  lightweight: { model: 'lightweight-model', adapter: 'fixture' },
} };
const CAPACITY = { tasks: 2, availableMemoryBytes: 8 * 1024 ** 3 };
const CHECKS = { verify: { command: process.execPath, args: ['-e', 'process.exit(0)'] } };
const pass = () => ({ verdict: 'pass', findings: [] });
const item = (id, dependsOn = []) => ({ id, title: `Implement ${id}`, details: `Write the scoped ${id} output.`,
  difficulty: 'routine', agentRole: 'lightweight', effort: 'low', reviewRole: 'primary', reviewEffort: 'high',
  dependsOn, readScope: ['tracked.txt'], writeScope: [`${id}.txt`], acceptance: ['The scoped output is valid'], checks: ['verify'] });
function workflow(root, baseSha, tasks) {
  return { schemaVersion: 2, id: 'security-gate', goal: 'Implement and check the complete change',
    repository: { root, baseSha }, tasks, questions: [], decisions: [], securityReviewEffort: 'high', securityFixEffort: 'high' };
}
const finding = { path: 'a.txt', line: 1, severity: 'high', condition: 'The output is unsafe',
  impact: 'Unsafe persisted output', evidence: 'The candidate contains unsafe output', fix: 'Write safe output' };

async function exists(path) { return access(path).then(() => true, () => false); }

test('security runs once after all task phases in its own lane at the final candidate', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const writers = new Set();
  const reviewLanes = [];
  let correctnessReviews = 0;
  let securityReviews = 0;
  const result = await executeWorkflow({ workflow: workflow(root, baseSha, [item('a'), item('b'), item('c', ['a'])]),
    digest: 'approved', repoRoot: root, statePath, roles: ROLES, checks: CHECKS, capacity: CAPACITY,
    adapter: async ({ task, cwd, model }) => {
      assert.equal(model.model, 'lightweight-model');
      writers.add(cwd);
      await writeFile(join(cwd, task.writeScope[0]), task.id);
      return { status: 'completed' };
    },
    review: async ({ phase, cwd, model, headSha }) => {
      assert.equal(writers.has(cwd), false, 'a review must use a different lane from implementation');
      assert.equal(reviewLanes.includes(cwd), false, 'each review must have a new checkout');
      reviewLanes.push(cwd);
      assert.match(headSha, /^[a-f0-9]{40}$/);
      if (phase === 'security-review') {
        securityReviews += 1;
        assert.equal(correctnessReviews, 3, 'security must wait for all implementation phases');
        assert.equal(model.model, 'general-model');
        for (const id of ['a', 'b', 'c']) assert.equal(await readFile(join(cwd, `${id}.txt`), 'utf8'), id);
      } else {
        assert.equal(phase, 'correctness-review');
        assert.equal(model.model, 'primary-model');
        correctnessReviews += 1;
      }
      return pass();
    } });
  assert.equal(result.status, 'completed', result.error ?? JSON.stringify(result.tasks));
  assert.equal(securityReviews, 1);
  assert.equal(correctnessReviews, 3);
}));

test('security findings use a new general fix lane and revalidate repaired changes', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const modelCalls = [];
  const writerLanes = new Set();
  const reviewerLanes = new Set();
  let securityReviews = 0;
  const result = await executeWorkflow({ workflow: workflow(root, baseSha, [item('a')]), digest: 'approved',
    repoRoot: root, statePath, roles: ROLES, checks: CHECKS, capacity: CAPACITY,
    adapter: async ({ cwd, model }) => {
      assert.equal(writerLanes.has(cwd), false);
      assert.equal(reviewerLanes.has(cwd), false);
      writerLanes.add(cwd); modelCalls.push(model.model);
      await writeFile(join(cwd, 'a.txt'), model.model === 'general-model' ? 'safe' : 'unsafe');
      return { status: 'completed' };
    },
    review: async ({ phase, cwd, model }) => {
      assert.equal(writerLanes.has(cwd), false);
      assert.equal(reviewerLanes.has(cwd), false);
      reviewerLanes.add(cwd);
      if (phase !== 'security-review') { assert.equal(model.model, 'primary-model'); return pass(); }
      assert.equal(model.model, 'general-model'); securityReviews += 1;
      if (securityReviews === 1) return { verdict: 'needs_fix', findings: [finding] };
      assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'safe');
      return pass();
    } });
  assert.equal(result.status, 'completed', result.error ?? JSON.stringify(result.tasks));
  assert.deepEqual(modelCalls, ['lightweight-model', 'general-model']);
  assert.equal(securityReviews, 2, 'changed security fixes require a new verdict');
  assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'safe');
}));

for (const failure of ['blocked', 'mutation', 'stopped']) {
  test(`a ${failure} security lane cannot apply the workflow`, async () => repoFixture(async ({ root, statePath, baseSha }) => {
    const controller = new AbortController();
    const result = await executeWorkflow({ workflow: workflow(root, baseSha, [item('a')]), digest: 'approved',
      repoRoot: root, statePath, roles: ROLES, checks: CHECKS, capacity: CAPACITY, signal: controller.signal,
      adapter: async ({ cwd }) => { await writeFile(join(cwd, 'a.txt'), 'candidate'); return { status: 'completed' }; },
      review: async ({ phase, cwd }) => {
        if (phase !== 'security-review') return pass();
        if (failure === 'blocked') return { verdict: 'blocked', findings: [], reason: 'No security evidence' };
        if (failure === 'mutation') await writeFile(join(cwd, 'a.txt'), 'changed during review');
        if (failure === 'stopped') controller.abort(new Error('stop during security review'));
        return pass();
      } });
    assert.equal(result.status, failure === 'stopped' ? 'stopped' : 'failed');
    assert.equal(await exists(join(root, 'a.txt')), false);
  }));
}

test('a verified security repair remains recoverable when a later security verdict blocks', async () => repoFixture(async ({ root, statePath, baseSha }) => {
  const spec = workflow(root, baseSha, [item('a')]);
  const models = [];
  let securityReviews = 0;
  const adapter = async ({ cwd, model }) => {
    models.push(model.model);
    await writeFile(join(cwd, 'a.txt'), model.model === 'general-model' ? 'safe' : 'unsafe');
    return { status: 'completed' };
  };
  const failed = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles: ROLES,
    checks: CHECKS, capacity: CAPACITY, adapter, review: async ({ phase }) => {
      if (phase !== 'security-review') return pass();
      securityReviews += 1;
      return securityReviews === 1 ? { verdict: 'needs_fix', findings: [finding] }
        : { verdict: 'blocked', findings: [], reason: 'The final review could not finish' };
    } });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.finalEvidence.security.reviews.at(-1).verdict, 'blocked');
  assert.equal(await exists(join(root, 'a.txt')), false);
  const resumed = await executeWorkflow({ workflow: spec, digest: 'approved', repoRoot: root, statePath, roles: ROLES,
    runId: failed.runId, checks: CHECKS, capacity: CAPACITY,
    adapter: async () => { throw new Error('Completed implementation and verified repair must not rerun'); },
    review: async ({ phase, cwd }) => {
      assert.equal(phase, 'security-review');
      assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'safe');
      return pass();
    } });
  assert.equal(resumed.status, 'completed', resumed.error);
  assert.deepEqual(models, ['lightweight-model', 'general-model']);
  assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'safe');
}));

for (const rejectedBy of ['correctness', 'check']) {
  test(`a security repair rejected by ${rejectedBy} returns evidence to a new general lane`, async () => repoFixture(async ({ root, statePath, baseSha }) => {
    let repairs = 0;
    let securityReviews = 0;
    const repairLanes = new Set();
    const checks = rejectedBy === 'check' ? { verify: { command: process.execPath, args: ['-e',
      "process.exit(require('node:fs').readFileSync('a.txt','utf8') === 'first-repair' ? 7 : 0)"] } } : CHECKS;
    const result = await executeWorkflow({ workflow: workflow(root, baseSha, [item('a')]), digest: 'approved',
      repoRoot: root, statePath, roles: ROLES, checks, capacity: CAPACITY,
      adapter: async ({ cwd, model, context }) => {
        if (model.model !== 'general-model') {
          await writeFile(join(cwd, 'a.txt'), 'unsafe');
          return { status: 'completed' };
        }
        assert.equal(repairLanes.has(cwd), false);
        repairLanes.add(cwd); repairs += 1;
        if (repairs === 2) {
          if (rejectedBy === 'check') assert.equal(context.verificationFailure?.exitCode ?? JSON.parse(context).verificationFailure?.exitCode, 7);
          else assert.match(typeof context === 'string' ? context : JSON.stringify(context), /repair broke the contract/);
        }
        await writeFile(join(cwd, 'a.txt'), repairs === 1 ? 'first-repair' : 'safe');
        return { status: 'completed' };
      },
      review: async ({ phase, task, cwd }) => {
        if (phase === 'security-review') {
          securityReviews += 1;
          if (securityReviews === 1) return { verdict: 'needs_fix', findings: [finding] };
          assert.equal(await readFile(join(cwd, 'a.txt'), 'utf8'), 'safe');
          return pass();
        }
        if (rejectedBy === 'correctness' && task.id === 'security-fix' && repairs === 1) {
          return { verdict: 'needs_fix', findings: [{ ...finding, condition: 'repair broke the contract' }] };
        }
        return pass();
      } });
    assert.equal(result.status, 'completed', result.error);
    assert.equal(repairs, 2);
    assert.equal(securityReviews, 2, 'security revalidation waits for repair checks and correctness');
    assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'safe');
  }));
}

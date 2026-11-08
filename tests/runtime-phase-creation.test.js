import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { planCommand, validateApproval } from '../runtime/cli-plan.mjs';
import { generatePlanArtifacts } from '../runtime/plan-artifacts.mjs';
import { artifactPath, writeJson } from '../runtime/files.mjs';
import { loadWorkflow, serializeWorkflow, validateWorkflow } from '../runtime/workflow.mjs';
import { repoFixture } from './runtime-fixtures.mjs';

function draft(root, baseSha) {
  return { schemaVersion: 2, id: 'phase-contract', goal: 'Persist detailed phase instructions', repository: { root, baseSha },
    tasks: [{ id: 'T01', title: 'Write output', details: 'Write the agreed output and preserve existing data.', effort: 'low',
      dependsOn: [], readScope: ['tracked.txt'], writeScope: ['output.txt'], acceptance: ['The output is correct'], checks: ['verify'] }],
    questions: [], decisions: [] };
}
const ROLES = { primary: { adapter: 'fixture', model: 'sol' }, general: { adapter: 'fixture', model: 'glm' },
  lightweight: { adapter: 'fixture', model: 'flash' } };

async function approvedFixture(root, baseSha) {
  const workflow = validateWorkflow(draft(root, baseSha));
  const path = artifactPath(root, 'workflows', workflow.id, 'workflow.mjs');
  await writeFile(path, serializeWorkflow(workflow));
  const loaded = await loadWorkflow(path);
  const artifacts = generatePlanArtifacts({ root, workflow, roles: ROLES, catalog: [] });
  const receiptPath = artifactPath(root, 'workflows', workflow.id, 'approval.json');
  const receipt = { schemaVersion: 2, digest: loaded.digest, repository: root, explicitUserParticipation: true,
    checksDigest: createHash('sha256').update('{}').digest('hex'), artifacts,
    rolesDigest: createHash('sha256').update(JSON.stringify({ general: ROLES.general, lightweight: ROLES.lightweight, primary: ROLES.primary })).digest('hex') };
  writeJson(receiptPath, receipt);
  return { workflow: loaded.workflow, digest: loaded.digest, receiptPath, receipt };
}

function phaseMetadata(text) {
  const fields = new Map(text.split('\n').filter(line => /^- (Agent role|Reviewer role|Effort):/.test(line)).map(line => {
    const split = line.indexOf(':');
    return [line.slice(2, split), line.slice(split + 1).trim().split(' ')[0]];
  }));
  return { role: fields.get('Agent role') ?? fields.get('Reviewer role'), effort: fields.get('Effort') };
}

test('task creation writes each planned phase before models are resolved or execution is approved', async () => repoFixture(async ({ root: fixtureRoot, baseSha }) => {
  const root = await realpath(fixtureRoot);
  const input = draft(root, baseSha);
  const path = join(root, 'draft.json');
  await writeFile(path, JSON.stringify(input));
  await planCommand('plan', [path], root);
  const base = join(root, '.hyperflow/workflows/phase-contract');
  for (const [file, role, effort] of [
    ['planning.md', 'primary', 'high'], ['security-review.md', 'general', 'high'], ['security-fix.md', 'general', 'high'],
    ['tasks/T01/implementation.md', 'lightweight', 'low'], ['tasks/T01/correctness-review.md', 'primary', 'high'],
  ]) {
    const text = await readFile(join(base, file), 'utf8');
    assert.deepEqual(phaseMetadata(text), { role, effort }, file);
  }
  assert.ok((await readFile(join(base, 'tasks/T01/task.md'), 'utf8')).includes(input.tasks[0].details));
  assert.ok((await readFile(join(base, 'tasks/T01/correctness-review.md'), 'utf8')).includes(input.tasks[0].details));
}));

test('removing a receipt entry cannot make a missing mandatory phase acceptable', async () => repoFixture(async ({ root: fixtureRoot, baseSha }) => {
  const root = await realpath(fixtureRoot);
  const { workflow, digest, receiptPath, receipt } = await approvedFixture(root, baseSha);
  validateApproval(root, workflow, digest);
  await unlink(join(root, '.hyperflow/workflows/phase-contract/tasks/T01/implementation.md'));
  delete receipt.artifacts['tasks/T01/implementation.md'];
  writeJson(receiptPath, receipt);
  assert.throws(() => validateApproval(root, workflow, digest), /mandatory|artifact set|expected.*artifact/i);
}));

test('approval pins model bindings while identical bindings survive a scope-label change', async () => repoFixture(async ({ root: fixtureRoot, baseSha }) => {
  const root = await realpath(fixtureRoot);
  const { workflow, digest } = await approvedFixture(root, baseSha);
  validateApproval(root, workflow, digest, { roles: ROLES, revision: 'project-revision' });
  validateApproval(root, workflow, digest, { roles: ROLES, revision: 'session-revision' });
  assert.throws(() => validateApproval(root, workflow, digest, {
    roles: { ...ROLES, primary: { adapter: 'fixture', model: 'different-model' } },
  }), /role bindings changed/i);
}));

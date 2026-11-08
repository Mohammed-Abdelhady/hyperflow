import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseWorkflow, validateWorkflow, loadWorkflow, serializeWorkflow } from '../runtime/workflow.mjs';

const valid = () => ({
  schemaVersion: 1, id: 'demo', goal: 'ship safely', repository: { root: '/repo', baseSha: 'a'.repeat(40) },
  tasks: [{ id: 'T01', title: 'Build', agentRole: 'general', effort: 'medium', dependsOn: [], readScope: ['src'], writeScope: ['src/a.js'], acceptance: ['works'], checks: ['unit-check'] }],
  questions: [], decisions: [],
});

test('parses only a static JSON-compatible default declaration and round trips canonically', () => {
  const workflow = valid();
  const source = `export default ${JSON.stringify(workflow)};`;
  assert.deepEqual(parseWorkflow(source), workflow);
  assert.match(serializeWorkflow(workflow), /^export default \{/);
  assert.deepEqual(parseWorkflow(serializeWorkflow(workflow)), workflow);
});

test('rejects executable syntax, injected trailing code and malformed declarations', () => {
  for (const source of [
    'export default (() => { globalThis.pwned = true; return {}; })();',
    'export default {"schemaVersion":1}; globalThis.pwned = true;',
    'import fs from "node:fs"; export default {};',
    'export default { schemaVersion: 1 };',
    'export default {"__proto__": {}, "schemaVersion": 1};',
    '',
  ]) assert.throws(() => parseWorkflow(source));
  assert.equal(globalThis.pwned, undefined);
});

test('validates scopes, roles, dependency references and acyclic task graph', () => {
  const workflow = valid();
  assert.deepEqual(validateWorkflow(workflow), workflow);
  const namedProfile = validateWorkflow({ ...workflow, tasks: [{ ...workflow.tasks[0], agentRole: 'implementation', reviewRole: 'independent-review', reviewEffort: 'high' }] });
  assert.equal(namedProfile.tasks[0].agentRole, 'implementation');
  assert.equal(namedProfile.tasks[0].effort, 'medium');
  const invalid = [
    { ...workflow, tasks: [{ ...workflow.tasks[0], agentRole: '../unsafe' }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], effort: undefined }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], writeScope: ['../secret'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], writeScope: ['src/../secret'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], surprise: 'authority' }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], readScope: ['/etc/passwd'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], writeScope: ['.env.local'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], writeScope: ['.git/refs'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], writeScope: ['.hyperflow/runtime.db'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], dependsOn: ['missing'] }] },
    { ...workflow, tasks: [workflow.tasks[0], { ...workflow.tasks[0], dependsOn: ['T02'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], id: 'T01', dependsOn: ['T02'] }, { ...workflow.tasks[0], id: 'T02', dependsOn: ['T01'] }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], resources: { browserSpaces: 6 } }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], reviewRole: '../unsafe', reviewEffort: 'low' }] },
    { ...workflow, tasks: [{ ...workflow.tasks[0], reviewEffort: 'low' }] },
  ];
  for (const candidate of invalid) assert.throws(() => validateWorkflow(candidate));
});

test('loader returns canonical SHA-256 independent of source object key order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hyperflow-workflow-'));
  try {
    const workflow = valid();
    const path = join(dir, 'workflow.mjs');
    const reverseKeys = (value) => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)])) : value;
    await writeFile(path, `export default ${JSON.stringify(reverseKeys(workflow))};`);
    const loaded = await loadWorkflow(path);
    const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value;
    const canonical = JSON.stringify(sortKeys(validateWorkflow(workflow)));
    assert.deepEqual(loaded.workflow, workflow);
    assert.equal(loaded.digest, createHash('sha256').update(canonical).digest('hex'));
    await writeFile(path, `export default ${' '.repeat(1048577)};`);
    await assert.rejects(loadWorkflow(path), /1 MiB/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

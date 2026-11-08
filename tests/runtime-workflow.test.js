import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseWorkflow, validateWorkflow, loadWorkflow, serializeWorkflow } from '../runtime/workflow.mjs';

const schema2 = () => ({
  schemaVersion: 2, id: 'demo2', goal: 'ship safely', repository: { root: '/repo', baseSha: 'a'.repeat(40) },
  tasks: [{ id: 'T01', title: 'Build', details: 'Write the module and wire it up.', effort: 'medium', dependsOn: [],
    readScope: ['src'], writeScope: ['src/a.js'], acceptance: ['works'], checks: ['unit-check'] }],
  questions: [], decisions: [],
});

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

test('schema 2 applies routing defaults, review defaults and workflow security efforts', () => {
  const normalized = validateWorkflow(schema2());
  assert.equal(normalized.schemaVersion, 2);
  assert.deepEqual(normalized.tasks[0], {
    id: 'T01', title: 'Build', details: 'Write the module and wire it up.', difficulty: 'routine',
    agentRole: 'lightweight', effort: 'medium', reviewRole: 'primary', reviewEffort: 'high',
    dependsOn: [], readScope: ['src'], writeScope: ['src/a.js'], acceptance: ['works'], checks: ['unit-check'],
  });
  assert.equal(normalized.securityReviewEffort, 'high');
  assert.equal(normalized.securityFixEffort, 'high');
  for (const [difficulty, role] of [['routine', 'lightweight'], ['complex', 'general'], ['security', 'general']]) {
    const routed = validateWorkflow({ ...schema2(), tasks: [{ ...schema2().tasks[0], difficulty, agentRole: role }] });
    assert.equal(routed.tasks[0].agentRole, role);
  }
  const adjusted = validateWorkflow({ ...schema2(), securityReviewEffort: 'low', securityFixEffort: 'medium' });
  assert.equal(adjusted.securityReviewEffort, 'low');
  assert.equal(adjusted.securityFixEffort, 'medium');
});

test('schema 2 rejects blank details, missing or invalid effort, and conflicting routing', () => {
  const base = schema2();
  const invalid = [
    { ...base, tasks: [{ ...base.tasks[0], details: '   ' }] },
    { ...base, tasks: [{ ...base.tasks[0], details: undefined }] },
    { ...base, tasks: [{ ...base.tasks[0], effort: undefined }] },
    { ...base, tasks: [{ ...base.tasks[0], effort: 'deep' }] },
    { ...base, tasks: [{ ...base.tasks[0], effort: 'MEDIUM' }] },
    { ...base, tasks: [{ ...base.tasks[0], difficulty: 'trivial' }] },
    { ...base, tasks: [{ ...base.tasks[0], difficulty: 'routine', agentRole: 'general' }] },
    { ...base, tasks: [{ ...base.tasks[0], difficulty: 'complex', agentRole: 'lightweight' }] },
    { ...base, tasks: [{ ...base.tasks[0], difficulty: 'security', agentRole: 'lightweight' }] },
    { ...base, tasks: [{ ...base.tasks[0], reviewRole: 'general' }] },
    { ...base, tasks: [{ ...base.tasks[0], reviewEffort: 'extreme' }] },
    { ...base, tasks: [{ ...base.tasks[0], id: '../escape' }] },
    { ...base, tasks: [{ ...base.tasks[0], securityReviewRole: 'general' }] },
    { ...base, tasks: [{ ...base.tasks[0], securityReviewEffort: 'low' }] },
    { ...base, securityReviewEffort: 'extreme' },
    { ...base, securityFixEffort: '' },
  ];
  for (const candidate of invalid) assert.throws(() => validateWorkflow(candidate));
});

test('historic schema 1 parsing is preserved and schema 2 fields stay out of schema 1', () => {
  const v1 = validateWorkflow(valid());
  assert.equal(v1.schemaVersion, 1);
  assert.equal(v1.tasks[0].agentRole, 'general');
  assert.throws(() => validateWorkflow({ ...valid(), schemaVersion: 3 }));
  const stale = [
    { ...valid(), tasks: [{ ...valid().tasks[0], details: 'not a schema 1 field' }] },
    { ...valid(), tasks: [{ ...valid().tasks[0], difficulty: 'complex' }] },
    { ...valid(), securityReviewEffort: 'high' },
    { ...valid(), securityFixEffort: 'high' },
  ];
  for (const candidate of stale) assert.throws(() => validateWorkflow(candidate));
});

test('schema 2 workflows round trip through the loader with a stable digest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hyperflow-schema2-'));
  try {
    const path = join(dir, 'workflow.mjs');
    await writeFile(path, `export default ${JSON.stringify(schema2())};`);
    const first = await loadWorkflow(path);
    assert.equal(first.workflow.schemaVersion, 2);
    assert.equal(first.workflow.tasks[0].agentRole, 'lightweight');
    await writeFile(path, serializeWorkflow(first.workflow));
    const second = await loadWorkflow(path);
    assert.equal(second.digest, first.digest);
    assert.deepEqual(second.workflow, first.workflow);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

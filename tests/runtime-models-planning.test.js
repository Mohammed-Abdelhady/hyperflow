import test from 'node:test';
import assert from 'node:assert/strict';
import { selectReviewAssignment, selectReviewAssignments } from '../runtime/assignments.mjs';
import { resolveRoles, validateTaskBinding } from '../runtime/models.mjs';
import { createPlan, answerQuestions, compilePlan, pendingQuestions } from '../runtime/planning.mjs';

const catalog = [
  { id: 'gpt-6.1-sol', adapter: 'codex', capabilities: ['reasoning'], efforts: ['low', 'high'] },
  { id: 'zai/glm-5.3', adapter: 'opencode', capabilities: ['coding'], variants: ['low', 'medium'] },
  { id: 'zai/glm-5.3-flash', adapter: 'opencode', capabilities: ['fast'], variants: ['low'] },
  { id: 'gpt-6.1-mini', adapter: 'codex', capabilities: ['fast'], efforts: ['low'] },
  { id: 'shared-model', adapter: 'claude-code', efforts: ['high'] },
];

test('role overlays resolve per role with catalog-backed IDs and capabilities', () => {
  const resolved = resolveRoles({ catalog, global: { general: { model: 'gpt-6.1-mini', adapter: 'codex', variant: 'low' } }, project: { general: { model: 'zai/glm-5.3', adapter: 'open-code' } }, session: { lightweight: { model: 'zai/glm-5.3-flash', adapter: 'opencode' } } });
  assert.equal(resolved.roles.general.model, 'zai/glm-5.3');
  assert.equal(resolved.roles.lightweight.model, 'zai/glm-5.3-flash');
  assert.equal(resolved.roles.primary.adapter, 'codex');
  assert.throws(() => resolveRoles({ catalog, session: { primary: { model: 'unknown/model', adapter: 'opencode' } } }));
  assert.throws(() => resolveRoles({ catalog, session: { primary: { model: 'zai/glm-5.3', adapter: 'opencode', capabilities: ['vision'] } } }));
  assert.throws(() => resolveRoles({ catalog, session: { primary: { model: 'zai/glm-5.3', adapter: 'opencode', variant: 'high' } } }));
  const customCatalog = ['custom/architect', 'custom/worker', 'custom/quick'].map((id) => ({ id, adapter: 'opencode' }));
  const customRoles = { primary: { model: 'custom/architect', adapter: 'opencode' }, general: { model: 'custom/worker', adapter: 'opencode' }, lightweight: { model: 'custom/quick', adapter: 'opencode' } };
  const custom = resolveRoles({ catalog: customCatalog, session: customRoles });
  assert.equal(custom.roles.general.model, 'custom/worker');
  assert.equal(custom.unavailableDefaults.length, 0);
  const claudeOnly = resolveRoles({ catalog: [{ id: 'claude-opus-4', adapter: 'claude', efforts: ['high'] }], session: { implementation: { model: 'claude-opus-4', adapter: 'claude-code' } } });
  assert.equal(claudeOnly.roles.implementation.adapter, 'claude-code');
  assert.equal(claudeOnly.unavailableDefaults.length, 3);
  assert.throws(() => resolveRoles({ catalog, session: { implementation: { model: 'missing', adapter: 'claude-code' } } }));
  const sameIdCatalog = [catalog[4], { id: 'shared-model', adapter: 'codex' }];
  assert.equal(resolveRoles({ catalog: sameIdCatalog, session: { implementation: { model: 'shared-model', adapter: 'codex' } } }).roles.implementation.adapter, 'codex');
  assert.throws(() => resolveRoles({ catalog: [catalog[4]], session: { implementation: { model: 'shared-model', adapter: 'codex' } } }));
  const assignment = validateTaskBinding({ agentRole: 'primary', effort: 'high', reviewRole: 'general', reviewEffort: 'medium' }, resolved, catalog);
  assert.deepEqual({ profile: assignment.profile, adapter: assignment.adapter, model: assignment.model, effort: assignment.effort, source: assignment.source }, { profile: 'primary', adapter: 'codex', model: 'gpt-6.1-sol', effort: 'high', source: 'default' });
  assert.throws(() => validateTaskBinding({ agentRole: 'primary', effort: 'medium' }, resolved, catalog));
  assert.throws(() => validateTaskBinding({ agentRole: 'primary' }, resolved, catalog));
});

test('six delegate harnesses and aliases preserve native model and effort metadata', () => {
  const harnessCatalog = [
    { id: 'claude-opus-4', adapter: 'claude-code' },
    { id: 'gpt-6.1-sol', adapter: 'codex', efforts: ['low', 'high'] },
    { id: 'gemini-pro', adapter: 'antigravity', efforts: ['fast', 'deep'] },
    { id: 'claude-sonnet', adapter: 'cursor', efforts: ['low', 'high'] },
    { id: 'zai/glm-5.3-flash', adapter: 'opencode', variants: ['low'] },
    { id: 'claude-sonnet', adapter: 'pi' },
  ];
  const profiles = {
    claude: { model: 'claude-opus-4', adapter: 'claudecode' },
    codex: { model: 'gpt-6.1-sol', adapter: 'codex' },
    agy: { model: 'gemini-pro', adapter: 'agy' },
    cursor: { model: 'claude-sonnet', adapter: 'cursor-agent' },
    opencode: { model: 'zai/glm-5.3-flash', adapter: 'open-code' },
    pi: { model: 'claude-sonnet', adapter: 'pi' },
  };
  const resolved = resolveRoles({ catalog: harnessCatalog, session: profiles });
  assert.deepEqual(Object.fromEntries(Object.keys(profiles).map((name) => [name, resolved.roles[name].adapter])), {
    agy: 'antigravity', claude: 'claude-code', codex: 'codex', cursor: 'cursor', opencode: 'opencode', pi: 'pi',
  });
  assert.equal(resolved.roles.claude.model, 'claude-opus-4');
  assert.equal(validateTaskBinding({ agentRole: 'pi', effort: 'harness-default' }, resolved, harnessCatalog).effort, 'harness-default');
  assert.equal(validateTaskBinding({ agentRole: 'claude', effort: 'high' }, resolved, harnessCatalog).effort, 'high');
  assert.throws(() => validateTaskBinding({ agentRole: 'claude', effort: 'high' }, resolved, [
    { id: 'claude-opus-4', adapter: 'claude-code', efforts: [] },
  ]));
  assert.throws(() => validateTaskBinding({ agentRole: 'codex', effort: 'medium' }, resolved, harnessCatalog));
});

const planInput = () => ({
  id: 'demo', goal: 'ship safely', repository: { root: '/repo', baseSha: 'a'.repeat(40) },
  tasks: [{ id: 'T01', title: 'Build', details: 'Implement the module behind the agreed API.', effort: 'medium',
    dependsOn: [], readScope: ['src'], writeScope: ['src/a.js'], acceptance: ['works'], checks: ['unit-check'] }],
  questions: [{ id: 'q1', prompt: 'Which API?', blocking: true, recommendation: 'REST', options: ['REST', 'GraphQL'], why: 'It affects clients' }],
});

test('plan requires actual blocking answers and explicit user participation before compilation', () => {
  const plan = createPlan(planInput());
  assert.throws(() => compilePlan(plan));
  assert.throws(() => answerQuestions(plan, { answers: { q1: '   ' }, confirmed: true }));
  assert.throws(() => answerQuestions(plan, { answers: { q1: 'REST' } }));
  const answered = answerQuestions(plan, { answers: { q1: 'REST' }, confirmed: true });
  const workflow = compilePlan(answered);
  assert.equal(workflow.questions[0].answer, 'REST');
  assert.equal(workflow.decisions.length, 1);
});

test('planner-supplied answers are discarded until explicit user confirmation', () => {
  const input = planInput();
  input.questions[0].answer = 'REST';
  const plan = createPlan(input);
  assert.equal(plan.questions[0].answer, undefined);
  assert.deepEqual(pendingQuestions(plan).map((question) => question.id), ['q1']);
  assert.throws(() => compilePlan(answerQuestions(plan, { confirmed: true, answers: {} })));
  const answered = answerQuestions(plan, { confirmed: true, answers: { q1: 'GraphQL' } });
  assert.equal(compilePlan(answered).questions[0].answer, 'GraphQL');
});

test('plans without questions still require confirmation and reject invalid plans', () => {
  const plan = createPlan({ ...planInput(), questions: [] });
  assert.throws(() => compilePlan(plan));
  assert.equal(compilePlan(answerQuestions(plan, { answers: {}, confirmed: true })).id, 'demo');
  assert.throws(() => createPlan({ ...planInput(), tasks: [] }));
});

test('question frontiers reveal prerequisites in rounds and reject same-batch dependent answers', () => {
  const input = planInput();
  input.questions = [
    { id: 'q1', prompt: 'Choose API', blocking: true },
    { id: 'q2', prompt: 'Choose client', blocking: true, dependsOn: ['q1'] },
  ];
  const plan = createPlan(input);
  assert.deepEqual(pendingQuestions(plan).map((question) => question.id), ['q1']);
  assert.throws(() => answerQuestions(plan, { answers: { q1: 'REST', q2: 'web' }, confirmed: true }));
  const first = answerQuestions(plan, { answers: { q1: 'REST' }, confirmed: true });
  assert.deepEqual(pendingQuestions(first).map((question) => question.id), ['q2']);
  const second = answerQuestions(first, { answers: { q2: 'web' }, confirmed: true });
  assert.equal(compilePlan(second).questions[1].answer, 'web');
  const cyclic = { ...input, questions: [{ id: 'a', prompt: 'A', blocking: true, dependsOn: ['b'] }, { id: 'b', prompt: 'B', blocking: true, dependsOn: ['a'] }] };
  assert.throws(() => createPlan(cyclic));
});

test('createPlan emits schema 2 with routing, review and security-lane defaults', () => {
  const plan = createPlan(planInput());
  assert.equal(plan.schemaVersion, 2);
  assert.equal(plan.tasks[0].difficulty, 'routine');
  assert.equal(plan.tasks[0].agentRole, 'lightweight');
  assert.equal(plan.tasks[0].reviewRole, 'primary');
  assert.equal(plan.tasks[0].reviewEffort, 'high');
  assert.equal(plan.securityReviewEffort, 'high');
  assert.equal(plan.securityFixEffort, 'high');
  const complex = createPlan({ ...planInput(), tasks: [{ ...planInput().tasks[0], difficulty: 'complex', effort: 'high' }] });
  assert.equal(complex.tasks[0].agentRole, 'general');
  const security = createPlan({ ...planInput(), tasks: [{ ...planInput().tasks[0], difficulty: 'security', agentRole: 'general', effort: 'medium' }] });
  assert.equal(security.tasks[0].agentRole, 'general');
  const workflow = compilePlan(answerQuestions(plan, { answers: { q1: 'REST' }, confirmed: true }));
  assert.equal(workflow.schemaVersion, 2);
  assert.equal(workflow.tasks[0].agentRole, 'lightweight');
  assert.equal(workflow.securityReviewEffort, 'high');
  assert.equal(workflow.securityFixEffort, 'high');
  const tuned = compilePlan(answerQuestions(createPlan({ ...planInput(), securityReviewEffort: 'low', securityFixEffort: 'medium' }), { answers: { q1: 'REST' }, confirmed: true }));
  assert.equal(tuned.securityReviewEffort, 'low');
  assert.equal(tuned.securityFixEffort, 'medium');
});

test('schema 1 drafts are refused and invalid schema 2 contracts cannot plan', () => {
  assert.throws(() => createPlan({ ...planInput(), schemaVersion: 1 }), /schema 2|re-plan/i);
  const input = planInput();
  const bad = [
    { ...input, tasks: [{ ...input.tasks[0], details: '  ' }] },
    { ...input, tasks: [{ ...input.tasks[0], effort: undefined }] },
    { ...input, tasks: [{ ...input.tasks[0], effort: 'deep' }] },
    { ...input, tasks: [{ ...input.tasks[0], difficulty: 'routine', agentRole: 'general' }] },
    { ...input, tasks: [{ ...input.tasks[0], difficulty: 'security', agentRole: 'lightweight' }] },
    { ...input, tasks: [{ ...input.tasks[0], reviewRole: 'general' }] },
    { ...input, tasks: [{ ...input.tasks[0], details: 'x'.repeat(5000) }] },
    { ...input, securityReviewEffort: 'extreme' },
    { ...input, securityFixEffort: 'deep' },
  ];
  for (const candidate of bad) assert.throws(() => createPlan(candidate));
});

test('standalone reviews require primary correctness and general security reviewers', () => {
  const primary = { adapter: 'opencode', model: 'zai/glm-5.3' };
  const general = { adapter: 'opencode', model: 'zai/glm-4.7' };
  const catalog = [
    { adapter: 'opencode', id: 'zai/glm-5.3', variants: ['low', 'medium', 'high'] },
    { adapter: 'opencode', id: 'zai/glm-4.7', variants: ['low', 'high'] },
  ];
  const assignments = selectReviewAssignments({ roles: { primary, general } }, catalog);
  assert.deepEqual(assignments.correctness, { phase: 'correctness-review', role: 'primary', model: primary, effort: 'high' });
  assert.deepEqual(assignments.security, { phase: 'security-review', role: 'general', model: general, effort: 'high' });
  assert.deepEqual(selectReviewAssignment({ roles: { primary, general } }, catalog), assignments.correctness);
  assert.throws(() => selectReviewAssignment({ roles: { general } }, catalog), /correctness-review/);
  assert.throws(() => selectReviewAssignments({ roles: { primary } }, catalog), /security-review/);
  assert.throws(() => selectReviewAssignments({ roles: {} }, []), /correctness-review/);
});

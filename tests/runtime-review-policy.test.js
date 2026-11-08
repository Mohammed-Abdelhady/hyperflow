import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReviewAssignment, selectReviewAssignments, validateAssignments } from '../runtime/assignments.mjs';
import { aggregateReviews, phaseFocus, securityFixTask, validateReviewOutcome } from '../runtime/review-policy.mjs';

const profiles = {
  primary: { model: 'zai/glm-5.3', adapter: 'opencode' },
  general: { model: 'zai/glm-4.7', adapter: 'opencode' },
  lightweight: { model: 'zai/glm-5.3-flash', adapter: 'opencode' },
};
const catalog = [
  { id: 'zai/glm-5.3', adapter: 'opencode', variants: ['low', 'medium', 'high'] },
  { id: 'zai/glm-4.7', adapter: 'opencode', variants: ['low', 'medium', 'high'] },
  { id: 'zai/glm-5.3-flash', adapter: 'opencode', variants: ['low'] },
];
const schemaTask = (extra = {}) => ({ id: 'T01', title: 'T01', details: 'Implement the pinned change.', difficulty: 'complex',
  agentRole: 'general', effort: 'high', reviewRole: 'primary', reviewEffort: 'high', dependsOn: [], readScope: [],
  writeScope: ['src/a.js'], acceptance: ['works'], checks: ['unit'], ...extra });
const workflowOf = (tasks, extra = {}) => ({ schemaVersion: 2, id: 'wf', goal: 'ship', repository: { root: '/tmp/repo', baseSha: 'f'.repeat(40) },
  securityReviewEffort: 'high', securityFixEffort: 'high', tasks, questions: [], decisions: [], ...extra });
const finding = () => ({ severity: 'high', path: 'src/a.js', line: 1, condition: 'Input is trusted', impact: 'Crash',
  evidence: 'The changed code reads it directly', fix: 'Validate the input' });

test('review phases carry distinct focus and unknown phases are rejected', () => {
  assert.match(phaseFocus('correctness-review'), /orrectness focus/i);
  assert.match(phaseFocus('security-review'), /security/);
  assert.throws(() => phaseFocus('performance-review'), /Unknown review phase/);
  assert.throws(() => phaseFocus(undefined), /Unknown review phase/);
  assert.throws(() => phaseFocus('constructor'), /Unknown review phase/);
  assert.throws(() => phaseFocus('__proto__'), /Unknown review phase/);
});

test('review assignments require primary correctness and general security reviewers', () => {
  const assignments = selectReviewAssignments({ roles: profiles }, catalog);
  assert.deepEqual([assignments.correctness.phase, assignments.correctness.role, assignments.correctness.model.model, assignments.correctness.effort],
    ['correctness-review', 'primary', 'zai/glm-5.3', 'high']);
  assert.deepEqual([assignments.security.phase, assignments.security.role, assignments.security.model.model, assignments.security.effort],
    ['security-review', 'general', 'zai/glm-4.7', 'high']);
  assert.deepEqual(selectReviewAssignment({ roles: profiles }, catalog), assignments.correctness);
  assert.throws(() => selectReviewAssignments({ roles: { general: profiles.general, lightweight: profiles.lightweight } }, catalog), /correctness-review.*primary|primary.*correctness-review/);
  assert.throws(() => selectReviewAssignments({ roles: { primary: profiles.primary, lightweight: profiles.lightweight } }, catalog), /security-review.*general|general.*security-review/);
  assert.throws(() => selectReviewAssignments({ roles: profiles }, catalog.slice(0, 1)), /security-review/);
  assert.throws(() => selectReviewAssignment({ roles: {} }, catalog), /correctness-review/);
  assert.throws(() => selectReviewAssignment({ roles: { primary: profiles.primary, general: profiles.general } },
    [{ id: 'zai/glm-5.3', adapter: 'opencode', variants: ['medium'] }, { id: 'zai/glm-4.7', adapter: 'opencode', variants: ['harness-default'] }]),
    /security-review.*effort|effort.*security-review/);
});

test('validateAssignments validates writers, primary reviewers and workflow security efforts', () => {
  validateAssignments(workflowOf([schemaTask()]), { roles: profiles }, catalog);
  validateAssignments(workflowOf([schemaTask({ difficulty: 'routine', agentRole: 'lightweight', effort: 'low' })]), { roles: profiles }, catalog);
  assert.throws(() => validateAssignments(workflowOf([schemaTask({ agentRole: 'lightweight' })]), { roles: profiles }, catalog), /general/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask({ difficulty: 'routine', agentRole: 'general' })]), { roles: profiles }, catalog), /lightweight/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask({ effort: 'xhigh' })]), { roles: profiles }, catalog), /effort/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask({ reviewRole: 'general' })]), { roles: profiles }, catalog), /correctness-review.*primary|primary.*correctness-review/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask({ reviewEffort: 'xhigh' })]), { roles: profiles }, catalog), /correctness-review.*effort|effort.*correctness-review/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask()]), { roles: { ...profiles, primary: { model: 'zai/missing', adapter: 'opencode' } } }, catalog), /correctness-review/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask()]), { roles: { ...profiles, general: { model: 'zai/missing', adapter: 'opencode' } } }, catalog), /security-review/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask()]), { roles: { primary: profiles.primary, lightweight: profiles.lightweight } }, catalog), /security-review/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask()]), { roles: profiles },
    [catalog[0], { id: 'zai/glm-4.7', adapter: 'opencode', variants: ['low', 'medium'] }]), /securityReviewEffort/);
  assert.throws(() => validateAssignments(workflowOf([schemaTask()], { securityFixEffort: 'ultra' }), { roles: profiles }, catalog), /securityFixEffort/);
  assert.throws(() => validateAssignments({ ...workflowOf([schemaTask()]), securityReviewEffort: 'extreme' }, { roles: profiles }, catalog), /securityReviewEffort/);
});

test('review outcomes reject invalid and contradictory verdicts per phase', () => {
  assert.equal(validateReviewOutcome({ verdict: 'pass', findings: [] }, 'correctness-review').verdict, 'pass');
  assert.throws(() => validateReviewOutcome({ verdict: 'pass', findings: [finding()] }, 'security-review'), /contradict/i);
  assert.throws(() => validateReviewOutcome({ verdict: 'needs_fix', findings: [] }, 'security-review'), /findings/i);
  assert.throws(() => validateReviewOutcome({ verdict: 'approved' }, 'security-review'), /verdict/i);
  assert.equal(validateReviewOutcome({ verdict: 'blocked', findings: [], reason: 'range too large' }, 'security-review').verdict, 'blocked');
  assert.throws(() => validateReviewOutcome({ verdict: 'pass', findings: [] }, 'quick-review'), /Unknown review phase/);
});

test('aggregated verdicts block when either required lane fails', () => {
  const pass = { verdict: 'pass', findings: [] };
  assert.deepEqual(aggregateReviews([pass, { verdict: 'pass', findings: [] }]), { verdict: 'pass', findings: [] });
  const repair = aggregateReviews([pass, { verdict: 'needs_fix', findings: [finding()] }]);
  assert.equal(repair.verdict, 'needs_fix');
  assert.equal(repair.findings.length, 1);
  assert.equal(aggregateReviews([{ verdict: 'blocked', findings: [] }, { verdict: 'needs_fix', findings: [finding()] }]).verdict, 'blocked');
  assert.throws(() => aggregateReviews([]), /independent review outcomes/);
  assert.throws(() => aggregateReviews([pass]), /independent review outcomes/);
});

test('security fix tasks stay general and scoped to the union of approved scopes', () => {
  const tasks = [schemaTask(), schemaTask({ id: 'T02', writeScope: ['src/b.js'], checks: ['unit', 'lint'] })];
  const fix = securityFixTask(workflowOf(tasks, { securityFixEffort: 'medium' }), tasks);
  assert.equal(fix.id, 'security-fix');
  assert.equal(fix.title, 'security-fix');
  assert.equal(fix.agentRole, 'general');
  assert.equal(fix.difficulty, 'security');
  assert.equal(fix.effort, 'medium');
  assert.equal(fix.reviewRole, 'primary');
  assert.deepEqual(fix.writeScope, ['src/a.js', 'src/b.js']);
  assert.deepEqual(fix.checks, ['unit', 'lint']);
  assert.ok(fix.acceptance.length);
  assert.throws(() => securityFixTask(workflowOf(tasks, { securityFixEffort: 'extreme' }), tasks), /securityFixEffort/);
});

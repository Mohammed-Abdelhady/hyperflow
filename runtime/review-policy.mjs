import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { runChecks } from './command.mjs';
import { EFFORT_LEVELS, effortLevel } from './task-contract.mjs';
import {
  assertChangesScoped, assertCommitScoped, assertNoScopeSymlinks, changedPaths, commitTaskChanges,
  createExecutionWorktree, git, integrateTaskChanges
} from './worktrees.mjs';

export { EFFORT_LEVELS, effortLevel } from './task-contract.mjs';
export const MAX_REPAIR_ROUNDS = 2;
const REVIEW_ROLES = { 'correctness-review': 'primary', 'security-review': 'general' };
const PHASE_FOCUS = {
  'correctness-review': 'Correctness focus: verify the pinned candidate diff against the task acceptance and checks. Report logic errors, broken or missing behavior, regressions and ungrounded claims; do not report style preferences.',
  'security-review': 'Security focus: verify the pinned candidate diff for security defects across the complete workflow. Report injection, unsafe handling of untrusted input, secret exposure, unsafe process or credential use and scope escape; do not report style preferences.',
};

export function phaseFocus(phase) {
  const focus = Object.hasOwn(PHASE_FOCUS, phase) ? PHASE_FOCUS[phase] : undefined;
  if (!focus) throw new Error(`Unknown review phase: ${phase ?? String(phase)}`);
  return focus;
}

export function selectReviewAssignments(configuration, catalog) {
  return { correctness: reviewProfile(configuration, catalog, 'correctness-review'), security: reviewProfile(configuration, catalog, 'security-review') };
}

export function selectReviewAssignment(configuration, catalog) {
  return selectReviewAssignments(configuration, catalog).correctness;
}

function reviewProfile(configuration, catalog, phase) {
  const role = REVIEW_ROLES[phase];
  const profiles = configuration?.roles ?? configuration;
  const model = profiles?.[role];
  if (!model) throw new Error(`The ${phase} phase requires the configured ${role} reviewer profile`);
  const efforts = catalogEfforts(catalog, model);
  const effort = [...EFFORT_LEVELS].reverse().find(level => efforts.includes(level));
  if (!effort) throw new Error(`The ${phase} phase has no supported ${role} review effort in the catalog`);
  return { phase, role, model, effort };
}

export function catalogEfforts(catalog, profile) {
  const descriptor = catalog.find(entry => entry.adapter === profile.adapter && entry.id === profile.model);
  return descriptor?.effortSupport === 'unknown' ? descriptor.acceptedEffortTokens ?? [] : descriptor?.variants ?? [];
}

export function validateReviewOutcome(outcome, phase) {
  phaseFocus(phase);
  if (!outcome || !['pass', 'needs_fix', 'blocked'].includes(outcome.verdict)) throw new Error(`Invalid ${phase} verdict`);
  if (!Array.isArray(outcome.findings)) throw new Error(`${phase} findings must be an array`);
  if (outcome.verdict === 'pass' && outcome.findings.length) throw new Error(`A passing ${phase} verdict contradicts its unresolved findings`);
  if (outcome.verdict === 'needs_fix' && !outcome.findings.length) throw new Error(`${phase} requested repairs without grounded findings`);
  return { ...outcome, findings: outcome.findings ?? [] };
}

export function aggregateReviews(outcomes) {
  const list = outcomes ?? [];
  if (!Array.isArray(list) || list.length !== 2) throw new Error('Both independent review outcomes are required');
  if (list.some(outcome => outcome?.verdict === 'blocked')) return { verdict: 'blocked', findings: [] };
  const findings = list.flatMap(outcome => outcome?.findings ?? []);
  return findings.length ? { verdict: 'needs_fix', findings } : { verdict: 'pass', findings: [] };
}

export function validateFindings(findings, candidatePaths) {
  const fields = ['path', 'condition', 'impact', 'evidence', 'fix', 'severity'];
  if (!Array.isArray(findings) || findings.some(item => !item || fields.some(key => typeof item[key] !== 'string' || !item[key].trim()) || !Number.isInteger(item.line) || item.line < 1 || !candidatePaths.includes(item.path))) {
    throw new Error('Reviewer findings require path, line, condition, impact, evidence, fix, and severity');
  }
  return findings;
}

export function securityReviewTask(workflow) {
  const effort = effortLevel(workflow.securityReviewEffort ?? 'high', 'workflow.securityReviewEffort');
  return { id: 'security-review', title: 'Consolidated security review', details: 'Review the complete workflow candidate for security defects.',
    difficulty: 'security', agentRole: 'general', effort, reviewRole: 'general', reviewEffort: effort, dependsOn: [],
    readScope: [], writeScope: [], acceptance: ['The complete workflow candidate introduces no security defect'], checks: [] };
}

export function securityFixTask(workflow, tasks) {
  const union = key => [...new Set(tasks.flatMap(task => task[key] ?? []))];
  return { id: 'security-fix', title: 'security-fix', details: 'Resolve every grounded finding from the consolidated security review of the final workflow candidate.',
    difficulty: 'security', agentRole: 'general', effort: effortLevel(workflow.securityFixEffort ?? 'high', 'workflow.securityFixEffort'),
    reviewRole: 'primary', reviewEffort: 'high', dependsOn: [], readScope: union('readScope'), writeScope: union('writeScope'),
    acceptance: ['Every consolidated security finding is resolved without introducing a new defect'], checks: union('checks') };
}

async function reviewLane({ task, phase, repoRoot, pin, baseSha, model, effort, review, signal }) {
  assertLive(signal);
  const lane = await createExecutionWorktree(repoRoot, pin);
  try {
    const verdict = await review({ task, phase, cwd: lane.path, baseSha, headSha: pin, model, effort, signal });
    assertLive(signal);
    if (await git(lane.path, ['rev-parse', 'HEAD']) !== pin) throw new Error(`The ${phase} reviewer changed the pinned candidate`);
    if ((await changedPaths(lane.path)).length) throw new Error(`The ${phase} reviewer left changes behind`);
    return { ...validateReviewOutcome(verdict, phase), phase, role: REVIEW_ROLES[phase], model: model.model,
      adapter: model.adapter, effort, lane: { id: randomUUID(), path: lane.path }, baseSha, headSha: pin };
  } finally { await lane.cleanup(); }
}

async function securityFixRound({ workflow, tasks, findings, round, repoRoot, integrationPath, profiles, adapter, checks, review, signal, baseSha, head, evidenceDirectory }) {
  const task = securityFixTask(workflow, tasks);
  const model = profiles.general;
  const lane = await createExecutionWorktree(repoRoot, head);
  try {
    assertLive(signal);
    await assertNoScopeSymlinks(lane.path, task);
    const context = JSON.stringify({ phase: 'security-fix', workflowGoal: workflow.goal, securityFindings: findings });
    const output = await adapter({ task, context, cwd: lane.path, model, effort: task.effort, signal, attempt: round + 1 });
    assertLive(signal);
    if (output?.status !== 'completed') throw new Error(`The security repair lane did not complete: ${output?.status ?? 'unknown status'}`);
    await assertNoScopeSymlinks(lane.path, task);
    await assertChangesScoped(lane.path, task);
    const fixHead = await commitTaskChanges(lane.path, task);
    const paths = await assertCommitScoped(lane.path, task, head, fixHead);
    if (!paths.length) throw new Error('The security repair produced no scoped change');
    const receipts = await runChecks(task, checks, lane.path, signal, path.join(evidenceDirectory, 'fix', `round-${round}`));
    if ((await changedPaths(lane.path)).length) throw new Error('Checks modified the security repair candidate tree');
    const merged = await integrateTaskChanges(lane.path, integrationPath, task, head);
    const primaryReview = await reviewLane({ task, phase: 'correctness-review', repoRoot, pin: merged.headSha, baseSha,
      model: profiles.primary, effort: task.reviewEffort, review, signal });
    if (primaryReview.verdict !== 'pass') throw new Error(`The primary correctness review rejected the security repair with ${primaryReview.verdict}`);
    return { task, paths, integrationHead: merged.headSha, evidence: { task: task.id, attempt: round + 1, phase: 'security-fix',
      role: 'general', model: model.model, adapter: model.adapter, effort: task.effort, lane: { id: randomUUID(), path: lane.path },
      baseSha: head, headSha: fixHead, paths, checks: receipts, review: primaryReview } };
  } finally { await lane.cleanup(); }
}

export async function runSecurityGate({ workflow, tasks, repoRoot, integrationPath, roles, adapter, checks, review, signal, evidenceDirectory }) {
  const profiles = roles?.roles ?? roles;
  if (!profiles?.primary || !profiles?.general) throw new Error('The final security gate requires the primary and general profiles');
  const baseSha = workflow.repository.baseSha;
  const securityTask = securityReviewTask(workflow);
  const reviews = [];
  const fixes = [];
  let head = await git(integrationPath, ['rev-parse', 'HEAD']);
  let taskChange = null;
  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round += 1) {
    const security = await reviewLane({ task: securityTask, phase: 'security-review', repoRoot, pin: head, baseSha,
      model: profiles.general, effort: securityTask.effort, review, signal });
    reviews.push(security);
    if (security.verdict === 'pass') return { verdict: 'pass', baseSha, integrationHead: head, reviews, fixes, taskChange };
    if (security.verdict === 'blocked') throw new Error(`The consolidated security review blocked the workflow: ${security.reason ?? 'reviewer blocked'}`);
    const findings = validateFindings(security.findings, await changedFiles(integrationPath, baseSha, head));
    if (round === MAX_REPAIR_ROUNDS) throw new Error('Security repair limit reached before a passing consolidated review');
    const fix = await securityFixRound({ workflow, tasks, findings, round, repoRoot, integrationPath, profiles, adapter, checks, review, signal, baseSha, head, evidenceDirectory });
    head = fix.integrationHead;
    fixes.push(fix.evidence);
    taskChange = { task: fix.task, paths: fix.paths };
  }
  throw new Error('Security repair limit reached before a passing consolidated review');
}

async function changedFiles(cwd, baseSha, headSha) {
  return (await git(cwd, ['diff', '--name-only', '-z', `${baseSha}..${headSha}`])).split('\0').filter(Boolean);
}

function assertLive(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error('Workflow stopped');
}

import { discoverCatalog } from './catalog.mjs';
import { effectiveRoles, configuredProfiles } from './config.mjs';
import { validateAssignments } from './assignments.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPlan, answerQuestions, compilePlan, pendingQuestions } from './planning.mjs';
import { loadWorkflow, serializeWorkflow } from './workflow.mjs';
import { artifactPath, readJson, SLUG, writeAtomic, writeJson } from './files.mjs';
import { loadChecks, validateChecks } from './checks.mjs';
import { SECURITY_LANE_ROLE, TASK_ID } from './task-contract.mjs';
import { generatePlanArtifacts, verifyPlanArtifacts } from './plan-artifacts.mjs';

export function repositoryRoot(cwd = process.cwd()) {
  return realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim());
}

function planPath(root, id) {
  if (!SLUG.test(id ?? '')) throw new Error('A workflow slug is required');
  return artifactPath(root, 'workflows', id, 'plan.json');
}

function indexPath(root, id) {
  if (!SLUG.test(id ?? '')) throw new Error('A workflow slug is required');
  return artifactPath(root, 'tasks', `${id}.md`);
}

function renderIndex(workflow, status, phaseLinks = false) {
  const pending = pendingQuestions(workflow);
  const tasks = workflow.tasks.map((task) => `- [ ] ${task.id}: ${task.title}; ${task.difficulty} → ${task.agentRole}; effort ${task.effort}; review ${task.reviewRole} (${task.reviewEffort}); depends ${task.dependsOn.join(', ') || 'none'}\n  ${task.details}`);
  const questions = workflow.questions.map((question) => `- ${question.id}: ${question.prompt}${question.answer ? ` — answered: ${question.answer}` : ' — unanswered'}`);
  const links = phaseLinks ? ['', 'Phase files:', ...workflow.tasks.map((task) => {
    if (!TASK_ID.test(task.id)) throw new Error(`Task ID is not a safe phase directory: ${task.id}`);
    return `- ${task.id}: .hyperflow/workflows/${workflow.id}/tasks/${task.id}/task.md`;
  }), `- security review: .hyperflow/workflows/${workflow.id}/security-review.md`] : [];
  return [`# ${workflow.goal}`, '', `Status: ${status}`, '', ...tasks, '', ...questions, ...links, ''].join('\n');
}

function bindingsDigest(configuration) {
  const roles = configuration.roles ?? configuration;
  const bindings = Object.fromEntries(Object.keys(roles).sort().map(role => {
    const { adapter, model, variant } = roles[role];
    return [role, { adapter, model, ...(variant === undefined ? {} : { variant }) }];
  }));
  return createHash('sha256').update(JSON.stringify(bindings)).digest('hex');
}

export function validateApprovedRoles(receipt, configuration) {
  if (receipt.rolesDigest !== bindingsDigest(configuration)) {
    throw new Error('Model role bindings changed after approval. Compile the reviewed plan again.');
  }
}

export async function planCommand(command, args, root) {
  if (command === 'plan') {
    if (args.length !== 1) throw new Error('Usage: plan <draft.json>');
    const draft = readJson(args[0]);
    const plan = createPlan(draft);
    if (realpathSync(resolve(plan.repository.root)) !== root) throw new Error('Plan belongs to another repository');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (plan.repository.baseSha !== head) throw new Error('Plan baseline does not match repository HEAD');
    writeJson(planPath(root, plan.id), plan);
    generatePlanArtifacts({ root, workflow: plan });
    const taskPath = indexPath(root, plan.id);
    writeAtomic(taskPath, renderIndex(plan, `awaiting answers (${pendingQuestions(plan).length} pending questions)`));
    return { id: plan.id, status: 'awaiting_answers', questions: pendingQuestions(plan), planPath: planPath(root, plan.id), taskPath };
  }
  if (command === 'answer') {
    if (args.length !== 2) throw new Error('Usage: answer <workflow-id> <answers.json>');
    const path = planPath(root, args[0]);
    const answered = answerQuestions(readJson(path), readJson(args[1]));
    writeJson(path, answered);
    generatePlanArtifacts({ root, workflow: answered });
    const pending = pendingQuestions(answered);
    writeAtomic(indexPath(root, answered.id), renderIndex(answered, pending.length ? `awaiting answers (${pending.length} pending questions)` : 'ready to compile'));
    return { id: answered.id, questions: pending, userParticipation: answered.explicitUserParticipation };
  }
  if (args.length !== 1) throw new Error('Usage: compile <workflow-id>');
  const plan = readJson(planPath(root, args[0]));
  const workflow = compilePlan(plan);
  validateChecks(workflow, loadChecks(root));
  const catalog = await discoverCatalog({ cwd: root, configured: configuredProfiles(root) });
  const profiles = effectiveRoles({ repoRoot: root, catalog });
  validateAssignments(workflow, profiles, catalog);
  const general = profiles.roles[SECURITY_LANE_ROLE];
  const path = artifactPath(root, 'workflows', workflow.id, 'workflow.mjs');
  writeAtomic(path, serializeWorkflow(workflow));
  const { digest } = await loadWorkflow(path);
  const artifacts = generatePlanArtifacts({ root, workflow, roles: profiles.roles, catalog });
  writeJson(artifactPath(root, 'workflows', workflow.id, 'approval.json'), {
    schemaVersion: 2, digest, repository: root, explicitUserParticipation: true,
    checksDigest: createHash('sha256').update(JSON.stringify(loadChecks(root))).digest('hex'),
    rolesRevision: profiles.revision, rolesDigest: bindingsDigest(profiles), artifacts,
  });
  writeAtomic(indexPath(root, workflow.id), renderIndex(workflow, 'compiled; execution requires smash', true));
  const assignment = (task) => {
    const profile = profiles.roles[task.agentRole];
    return { taskId: task.id, profile: task.agentRole, ...profile, effort: task.effort, effortSupport: catalog.find((entry) => entry.id === profile.model &&
      entry.adapter === profile.adapter)?.effortSupport ?? 'advertised' };
  };
  return { id: workflow.id, workflowPath: path, digest, status: 'ready', assignments: workflow.tasks.map(assignment),
    securityReview: { role: SECURITY_LANE_ROLE, ...general, effort: workflow.securityReviewEffort },
    securityFix: { role: SECURITY_LANE_ROLE, ...general, effort: workflow.securityFixEffort },
    artifacts: Object.keys(artifacts) };
}

export function validateApproval(root, workflow, digest, configuration) {
  if (workflow.schemaVersion !== 2) {
    throw new Error('Schema 1 workflows are read-only history and cannot execute. Re-plan on schema 2, answer, compile, and smash the new workflow.');
  }
  const receipt = readJson(artifactPath(root, 'workflows', workflow.id, 'approval.json'));
  if (receipt.schemaVersion !== 2 || receipt.digest !== digest || receipt.repository !== root ||
      receipt.explicitUserParticipation !== true ||
      receipt.checksDigest !== createHash('sha256').update(JSON.stringify(loadChecks(root))).digest('hex')) {
    throw new Error('Workflow or verification contract changed after user input. Compile the reviewed plan again.');
  }
  if (configuration !== undefined) validateApprovedRoles(receipt, configuration);
  verifyPlanArtifacts(root, workflow, receipt.artifacts);
  if (workflow.questions.some((question) => question.blocking && !question.answer)) throw new Error('Blocking answers are missing');
  return receipt;
}

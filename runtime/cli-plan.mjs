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

export function repositoryRoot(cwd = process.cwd()) {
  return realpathSync(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim());
}

function planPath(root, id) {
  if (!SLUG.test(id ?? '')) throw new Error('A workflow slug is required');
  return artifactPath(root, 'workflows', id, 'plan.json');
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
    const taskPath = artifactPath(root, 'tasks', `${plan.id}.md`);
    writeAtomic(taskPath, [`# ${plan.goal}`, '', 'Status: awaiting user input', '',
      ...plan.tasks.map((task) => `- [ ] ${task.id}: ${task.title}; role ${task.agentRole}; depends ${task.dependsOn.join(', ') || 'none'}`),
      '', ...plan.questions.map((question) => `- ${question.id}: ${question.prompt}`), ''].join('\n'));
    return { id: plan.id, status: 'awaiting_answers', questions: pendingQuestions(plan), planPath: planPath(root, plan.id), taskPath };
  }
  if (command === 'answer') {
    if (args.length !== 2) throw new Error('Usage: answer <workflow-id> <answers.json>');
    const path = planPath(root, args[0]);
    const answered = answerQuestions(readJson(path), readJson(args[1]));
    writeJson(path, answered);
    return { id: answered.id, questions: pendingQuestions(answered), userParticipation: answered.explicitUserParticipation };
  }
  if (args.length !== 1) throw new Error('Usage: compile <workflow-id>');
  const plan = readJson(planPath(root, args[0]));
  const workflow = compilePlan(plan);
  validateChecks(workflow, loadChecks(root));
  const catalog = await discoverCatalog({ cwd: root, configured: configuredProfiles(root) });
  const profiles = effectiveRoles({ repoRoot: root, catalog });
  validateAssignments(workflow, profiles, catalog);
  const path = artifactPath(root, 'workflows', workflow.id, 'workflow.mjs');
  writeAtomic(path, serializeWorkflow(workflow));
  const { digest } = await loadWorkflow(path);
  const approvalPath = artifactPath(root, 'workflows', workflow.id, 'approval.json');
  writeJson(approvalPath, { schemaVersion: 1, digest, repository: root, explicitUserParticipation: true,
    checksDigest: createHash('sha256').update(JSON.stringify(loadChecks(root))).digest('hex') });
  return { id: workflow.id, workflowPath: path, digest, status: 'ready', assignments: workflow.tasks.map((task) => ({
    taskId: task.id, profile: task.agentRole, ...profiles.roles[task.agentRole], effort: task.effort, effortSupport: catalog.find((entry) => entry.id === profiles.roles[task.agentRole].model &&
      entry.adapter === profiles.roles[task.agentRole].adapter)?.effortSupport ?? 'advertised' })) };
}

export function validateApproval(root, workflow, digest) {
  const receipt = readJson(artifactPath(root, 'workflows', workflow.id, 'approval.json'));
  if (receipt.digest !== digest || receipt.repository !== root || receipt.explicitUserParticipation !== true ||
      receipt.checksDigest !== createHash('sha256').update(JSON.stringify(loadChecks(root))).digest('hex')) {
    throw new Error('Workflow or verification contract changed after user input. Compile the reviewed plan again.');
  }
  if (workflow.questions.some((question) => question.blocking && !question.answer)) throw new Error('Blocking answers are missing');
}

import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { artifactPath, SLUG, writeAtomic } from './files.mjs';
import { CORRECTNESS_REVIEW_ROLE, SECURITY_LANE_ROLE, TASK_ID } from './task-contract.mjs';

const MAX_ARTIFACT_BYTES = 262144;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TASK_FILES = { task: 'task.md', implementation: 'implementation.md', review: 'correctness-review.md' };
const WORKFLOW_FILES = { planning: 'planning.md', review: 'security-review.md', fix: 'security-fix.md' };
const DISCLAIMER = 'Plan record. Generated files are not executable authority. Execution requires the compiled workflow and approval receipt.';
const digestOf = content => createHash('sha256').update(content).digest('hex');
const scopeText = items => items.length ? items.join(', ') : 'none';
const bullets = items => items.map(item => `- ${item}`).join('\n') || '(none)';

function bindingText(binding, effort) {
  if (!binding) return `unresolved until compilation; planned effort ${effort}`;
  return `adapter ${binding.adapter}, model ${binding.model}${binding.variant ? `, variant ${binding.variant}` : ''}, effort ${effort}`;
}

function record(title, role, effort, binding, body) {
  return `# ${title}\n${DISCLAIMER}\n\n- Agent role: ${role}\n- Effort: ${effort}\n` +
    `- Resolved binding: ${bindingText(binding, effort)}\n\n${body}\n`;
}

function scope(task) {
  return `- Dependencies: ${scopeText(task.dependsOn)}\n- Read scope: ${scopeText(task.readScope)}\n` +
    `- Approved implementation scope: ${scopeText(task.writeScope)}\n- Checks: ${scopeText(task.checks)}`;
}

function taskFiles(workflow, task, roles) {
  const prefix = `tasks/${task.id}/`;
  const contract = `Workflow: ${workflow.id} at ${workflow.repository.baseSha}. Difficulty: ${task.difficulty}.\n\n` +
    `## Task details\n${task.details}\n\n## Acceptance\n${bullets(task.acceptance)}\n\n## Scope and checks\n${scope(task)}`;
  return [
    { relativePath: prefix + TASK_FILES.task, content: record(`${task.id}: ${task.title}`, task.agentRole, task.effort, roles[task.agentRole],
      `${contract}\n\nCorrectness reviewer: ${task.reviewRole}, effort ${task.reviewEffort}.`) },
    { relativePath: prefix + TASK_FILES.implementation, content: record(`Implementation: ${task.id}`, task.agentRole, task.effort, roles[task.agentRole],
      `Use a fresh delegate lane with its own context and isolated checkout. Implement the approved scope; do not commit, push, or change runtime state.\n\n${contract}`) },
    { relativePath: prefix + TASK_FILES.review, content: record(`Correctness review: ${task.id}`, task.reviewRole, task.reviewEffort, roles[task.reviewRole],
      `Use a new independent read-only lane pinned to the integrated candidate. Report grounded changed-line findings with severity, condition, impact, evidence, and fix. A changed candidate requires a new verdict.\n\n${contract}`) },
  ];
}

function workflowFiles(workflow, roles) {
  const general = roles[SECURITY_LANE_ROLE];
  const union = key => [...new Set(workflow.tasks.flatMap(task => task[key]))];
  const combined = { dependsOn: [], readScope: union('readScope'), writeScope: union('writeScope'), checks: union('checks') };
  const rows = workflow.tasks.map(task => `| [${task.id}](tasks/${task.id}/task.md) | ${task.difficulty} | ${task.agentRole} / ${task.effort}: ${bindingText(roles[task.agentRole], task.effort)} | ${task.reviewRole} / ${task.reviewEffort} |`).join('\n');
  const questions = workflow.questions.map(q => `${q.id}: ${q.prompt}; ${q.answer ? `answered: ${q.answer}` : 'unanswered'}`);
  const planning = `Goal: ${workflow.goal}\nBase: ${workflow.repository.baseSha}\n\n` +
    `## Task contracts\n| Task | Difficulty | Implementation / effort | Correctness / effort |\n|---|---|---|---|\n${rows}\n\n` +
    `## Decisions\n${bullets(workflow.decisions.map(d => `${d.id}: ${d.text}`))}\n\n## Questions\n${bullets(questions)}\n\n` +
    `Routine work uses lightweight; complex and security work use general. Primary reviews each task in a new lane. General reviews security once after all ordinary phases, then owns conditional security fixes. See ${WORKFLOW_FILES.review} and ${WORKFLOW_FILES.fix}.`;
  const security = `Run once after all implementation and primary correctness phases, before applying changes to the user checkout. ` +
    `Use a new general delegate lane with independent context and a read-only checkout pinned to the final head.\n\n${scope(combined)}\n\n` +
    `Inspect the complete workflow diff and related callers for security defects. Ground findings on changed lines with severity, condition, impact, evidence, and fix. ` +
    `A pass permits application. needs_fix starts the general security-fix lane; blocked, contradictory, stopped, or mutated reviews prevent application. Revalidate repaired changes.`;
  const fix = `Conditional phase for validated findings from the security review or review of its repairs. ` +
    `Use a new general implementation lane with its own context and isolated checkout.\n\n${scope(combined)}\n\n` +
    `Correctness reviewer: ${CORRECTNESS_REVIEW_ROLE}, effort high, in another new read-only lane. ` +
    `Fix only validated findings inside the approved scope. Rerun affected checks, primary correctness review, then security revalidation. ` +
    `Automatic repairs remain capped at two rounds; unresolved findings, stops, or mutations prevent application.`;
  return [
    { relativePath: WORKFLOW_FILES.planning, content: record(`Plan: ${workflow.id}`, CORRECTNESS_REVIEW_ROLE, 'high', roles[CORRECTNESS_REVIEW_ROLE], planning) },
    { relativePath: WORKFLOW_FILES.review, content: record(`Security review: ${workflow.id}`, SECURITY_LANE_ROLE, workflow.securityReviewEffort, general, security) },
    { relativePath: WORKFLOW_FILES.fix, content: record(`Security fix: ${workflow.id}`, SECURITY_LANE_ROLE, workflow.securityFixEffort, general, fix) },
  ];
}

function expectedPaths(workflow) {
  if (workflow.schemaVersion !== 2 || !SLUG.test(workflow.id)) throw new Error('Phase files require a valid schema-2 workflow');
  const paths = Object.values(WORKFLOW_FILES);
  for (const task of workflow.tasks) {
    if (!TASK_ID.test(task.id)) throw new Error('Canonical task identifier is invalid');
    paths.push(...Object.values(TASK_FILES).map(name => `tasks/${task.id}/${name}`));
  }
  return paths;
}

export function generatePlanArtifacts({ root, workflow, roles = {} }) {
  expectedPaths(workflow);
  const files = [...workflow.tasks.flatMap(task => taskFiles(workflow, task, roles)), ...workflowFiles(workflow, roles)];
  const artifacts = {};
  for (const file of files) {
    if (Buffer.byteLength(file.content) > MAX_ARTIFACT_BYTES) throw new Error(`Plan artifact exceeds its size bound: ${file.relativePath}`);
    const path = artifactPath(root, 'workflows', workflow.id, ...file.relativePath.split('/'));
    writeAtomic(path, file.content);
    artifacts[file.relativePath] = digestOf(file.content);
  }
  return artifacts;
}

export function verifyPlanArtifacts(root, workflow, artifacts) {
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts) ||
      JSON.stringify(Object.keys(artifacts).sort()) !== JSON.stringify(expectedPaths(workflow).sort())) {
    throw new Error('Approval artifact set must include exactly every mandatory task and phase file');
  }
  for (const [relativePath, expected] of Object.entries(artifacts)) {
    const segments = relativePath.split('/');
    if (!segments.every(segment => SEGMENT.test(segment))) throw new Error(`Approved artifact path is invalid: ${relativePath}`);
    let path;
    try { path = artifactPath(root, 'workflows', workflow.id, ...segments); }
    catch (error) { throw new Error(`Approved plan artifact path is unsafe: ${relativePath}`, { cause: error }); }
    let metadata;
    try { metadata = lstatSync(path); } catch { throw new Error(`Approved plan artifact is missing: ${relativePath}`); }
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size > MAX_ARTIFACT_BYTES) {
      throw new Error(`Approved plan artifact must be a bounded single-link regular file: ${relativePath}`);
    }
    const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(file);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_ARTIFACT_BYTES) throw new Error(`Invalid approved artifact: ${relativePath}`);
      const buffer = Buffer.alloc(stat.size + 1);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const count = readSync(file, buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (count === 0) break;
        bytesRead += count;
      }
      if (bytesRead !== stat.size || digestOf(buffer.subarray(0, bytesRead)) !== expected) {
        throw new Error(`Approved plan artifact changed after approval: ${relativePath}`);
      }
    } finally { closeSync(file); }
  }
}

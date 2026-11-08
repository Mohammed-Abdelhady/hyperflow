import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { artifactPath, writeAtomic } from './files.mjs';
import { CORRECTNESS_REVIEW_ROLE, SECURITY_LANE_ROLE, TASK_ID } from './task-contract.mjs';

const MAX_ARTIFACT_BYTES = 262144;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DISCLAIMER = 'Planning record. Generated files are not executable authority; execution requires the compiled workflow digest and its approval receipt.';

function digestOf(content) {
  return createHash('sha256').update(content).digest('hex');
}

function scopeText(items) {
  return items.length ? items.join(', ') : 'none';
}

function bindingText(binding, effort) {
  if (!binding) return `unresolved until compilation; planned effort ${effort}`;
  return `adapter ${binding.adapter}, model ${binding.model}${binding.variant ? `, variant ${binding.variant}` : ''}, effort ${effort}`;
}

function taskContext(workflow, roles, catalog, task) {
  const binding = roles[task.agentRole];
  const reviewBinding = roles[task.reviewRole];
  const descriptor = binding && catalog.find((entry) => entry.adapter === binding.adapter && entry.id === binding.model);
  const supported = descriptor?.effortSupport === 'unknown' ? descriptor?.acceptedEffortTokens : descriptor?.variants;
  return { binding, reviewBinding, support: supported?.join('/') ?? null };
}

function acceptanceList(task) {
  return task.acceptance.map((item) => `- ${item}`).join('\n');
}

function taskFiles(workflow, task, context) {
  const dir = `tasks/${task.id}`;
  const header = `# ${task.id}: ${task.title}\n\nWorkflow ${workflow.id} (${workflow.goal}) based at ${workflow.repository.baseSha}.\n${DISCLAIMER}\n`;
  const contract = `## Assignment\n- Difficulty: ${task.difficulty}\n- Agent role: ${task.agentRole}\n- Effort: ${task.effort}\n` +
    `- Correctness review: ${task.reviewRole} role, effort ${task.reviewEffort}, fresh isolated read-only lane\n` +
    `- Dependencies: ${scopeText(task.dependsOn)}\n- Read scope: ${scopeText(task.readScope)}\n- Write scope: ${scopeText(task.writeScope)}\n` +
    `- Checks: ${scopeText(task.checks)}\n- Resolved binding: ${bindingText(context.binding, task.effort)}\n`;
  const detail = `## Task details\n${task.details}\n\n## Acceptance\n${acceptanceList(task)}\n`;
  return [
    { relativePath: `${dir}/task.md`, content: `${header}\n${contract}\n${detail}` },
    { relativePath: `${dir}/implementation.md`, content: `# Implementation lane: ${task.id}\n${DISCLAIMER}\n\n` +
      `- Agent role: ${task.agentRole} (fixed by ${task.difficulty} routing)\n- Effort: ${task.effort}\n` +
      `- Resolved binding: ${bindingText(context.binding, task.effort)}\n- Dependencies: ${scopeText(task.dependsOn)}\n` +
      `- Read scope: ${scopeText(task.readScope)}\n- Write scope: ${scopeText(task.writeScope)}\n- Checks: ${scopeText(task.checks)}\n\n` +
      `Runs in a fresh delegate lane with its own context and an isolated checkout created from the workflow base. ` +
      `Implement only inside the write scope; do not commit, push, touch workflow state, or widen scope. ` +
      `Repair rounds stay scoped to this contract and are capped at two per unchanged failure signature.\n\n${detail}` },
    { relativePath: `${dir}/correctness-review.md`, content: `# Correctness review: ${task.id}\n${DISCLAIMER}\n\n` +
      `- Reviewer role: ${task.reviewRole} (independent of the writer, who never reviews their own work)\n- Effort: ${task.reviewEffort}\n` +
      `- Resolved binding: ${bindingText(context.reviewBinding, task.reviewEffort)}\n` +
      `- Mode: fresh isolated read-only lane pinned to the exact integrated candidate head; the reviewer cannot edit, merge, or push.\n\n` +
      `## Task details\n${task.details}\n\n` +
      `## Reviewed contract\n- Acceptance:\n${acceptanceList(task)}\n- Candidate scope: ${scopeText(task.writeScope)}\n` +
      `- Checks that must pass: ${scopeText(task.checks)}\n\n` +
      `Report only grounded findings on changed lines with condition, impact, evidence, fix, and severity. ` +
      `Verdict: pass, needs_fix, or blocked. Re-review after any candidate mutation; never reuse a stale verdict.\n` },
  ];
}

function workflowFiles(workflow, roles, contexts) {
  const general = roles[SECURITY_LANE_ROLE];
  const rows = workflow.tasks.map((task) => `| ${task.id} | ${task.difficulty} | ${task.agentRole} | ${task.effort} | ${task.reviewRole} (${task.reviewEffort}) | ${bindingText(contexts.get(task.id).binding, task.effort)} |`).join('\n');
  const decisions = workflow.decisions.map((entry) => `- ${entry.id}: ${entry.text}`).join('\n') || '(none)';
  const questions = workflow.questions.map((question) => `- ${question.id}: ${question.prompt} — ${question.answer ? `answered: ${question.answer}` : 'unanswered'}`).join('\n') || '(none)';
  const details = workflow.tasks.map((task) => `- ${task.id}: see tasks/${task.id}/task.md for the full instructions.`).join('\n');
  const planning = `# Plan: ${workflow.id}\n${DISCLAIMER}\n\n- Goal: ${workflow.goal}\n- Workflow schema: 2, base ${workflow.repository.baseSha}\n` +
    `- Agent role: ${CORRECTNESS_REVIEW_ROLE}\n- Effort: high\n- Resolved binding: ${bindingText(roles[CORRECTNESS_REVIEW_ROLE], 'high')}\n` +
    `- Tasks: ${workflow.tasks.length}; routing: routine to lightweight, complex and security to general.\n\n` +
    `## Decisions\n${decisions}\n\n## Questions\n${questions}\n\n## Phases\n` +
    `| Task | Difficulty | Role | Effort | Correctness review (effort) | Resolved binding |\n|---|---|---|---|---|---|\n${rows}\n\n` +
    `## Task details\n\n${details}\n## Independent lanes\n` +
    `- Correctness review: every task is reviewed by the ${CORRECTNESS_REVIEW_ROLE} role in a fresh isolated read-only lane before integration.\n` +
    `- Security review: one consolidated review by the ${SECURITY_LANE_ROLE} role (effort ${workflow.securityReviewEffort}) runs once after all implementation and correctness phases complete, before changes are applied to the user checkout; see security-review.md.\n` +
    `- Conditional security fixes: validated findings are implemented by the ${SECURITY_LANE_ROLE} role in a new independent lane (effort ${workflow.securityFixEffort}) and revalidated; see security-fix.md.\n`;
  const securityReview = `# Consolidated security review: ${workflow.id}\n${DISCLAIMER}\n\n` +
    `Runs once, after all other phases have finished (every implementation phase and primary correctness review), and before any change is applied to the user checkout.\n\n` +
    `- Agent role: ${SECURITY_LANE_ROLE} (fixed)\n- Effort: ${workflow.securityReviewEffort}\n` +
    `- Resolved binding: ${bindingText(general, workflow.securityReviewEffort)}\n` +
    `- Mode: a fresh delegate lane with its own context and an isolated read-only checkout pinned to the final integrated head.\n\n` +
    `## Scope\nReview the complete workflow diff across all tasks: trust boundaries, secrets, injection, permission changes, and unsafe data handling.\n` +
    `Read only; the reviewer never edits. Findings must be grounded on changed lines with condition, impact, evidence, fix, and severity.\n\n` +
    `## Outcomes\n- pass: changes may be applied to the user checkout.\n` +
    `- needs_fix: findings route to the security fix lane (security-fix.md); fixes rerun affected checks, primary correctness review, and security revalidation before any apply.\n` +
    `- blocked: the workflow stops without applying changes. A failed or blocked verdict, a contradiction, a stop, or a candidate mutation prevents applying the workflow.\n`;
  const files = [
    { relativePath: 'planning.md', content: planning },
    { relativePath: 'security-review.md', content: securityReview },
  ];
  files.push({ relativePath: 'security-fix.md', content: `# Security fix lane: ${workflow.id}\n${DISCLAIMER}\n\n` +
      `Conditional phase: runs only when the final security review or review of a security repair finds a defect.\n\n` +
      `Security findings from the consolidated security review are implemented in a new independent ${SECURITY_LANE_ROLE} implementation lane: ` +
      `fresh context and an isolated checkout. The original task lanes are not reused for security fixes.\n\n` +
      `- Agent role: ${SECURITY_LANE_ROLE} (fixed)\n- Effort: ${workflow.securityFixEffort}\n` +
      `- Resolved binding: ${bindingText(general, workflow.securityFixEffort)}\n` +
      `- Correctness reviewer: ${CORRECTNESS_REVIEW_ROLE}\n- Correctness review effort: high\n` +
      `- Approved write scope: ${scopeText([...new Set(workflow.tasks.flatMap(task => task.writeScope))])}\n` +
      `- Checks: ${scopeText([...new Set(workflow.tasks.flatMap(task => task.checks))])}\n\n## Requirements\n` +
      `- Fixes stay scoped to the validated security findings.\n- Affected checks rerun after the fix.\n` +
      `- Primary correctness review reruns on the fixed candidate in a fresh read-only lane.\n` +
      `- Security revalidation confirms the findings are resolved; an unresolved finding, a stopped lane, or a mutated candidate blocks applying the workflow.\n` });
  return files;
}

export function generatePlanArtifacts({ root, workflow, roles = {}, catalog = [] }) {
  const contexts = new Map(workflow.tasks.map((task) => [task.id, taskContext(workflow, roles, catalog, task)]));
  const files = [...workflow.tasks.flatMap((task) => taskFiles(workflow, task, contexts.get(task.id))), ...workflowFiles(workflow, roles, contexts)];
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
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts) || !Object.keys(artifacts).length) {
    throw new Error('Approval receipt records no plan artifacts');
  }
  const expectedPaths = ['planning.md', 'security-review.md', 'security-fix.md'];
  for (const task of workflow.tasks) {
    if (!TASK_ID.test(task.id)) throw new Error('Canonical task identifier is invalid');
    expectedPaths.push(...['task.md', 'implementation.md', 'correctness-review.md'].map(name => `tasks/${task.id}/${name}`));
  }
  if (JSON.stringify(Object.keys(artifacts).sort()) !== JSON.stringify(expectedPaths.sort())) {
    throw new Error('Approval artifact set must include exactly every mandatory task and phase file');
  }
  for (const [relativePath, expected] of Object.entries(artifacts)) {
    const segments = relativePath.split('/');
    if (!segments.length || !segments.every((segment) => SEGMENT.test(segment))) throw new Error(`Approved artifact path is invalid: ${relativePath}`);
    let path;
    try { path = artifactPath(root, 'workflows', workflow.id, ...segments); }
    catch (error) { throw new Error(`Approved plan artifact path is unsafe: ${relativePath}`, { cause: error }); }
    let metadata;
    try { metadata = lstatSync(path); } catch { throw new Error(`Approved plan artifact is missing: ${relativePath}`); }
    if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.nlink !== 1) {
      throw new Error(`Approved plan artifact is not a regular single-link file: ${relativePath}`);
    }
    if (metadata.size > MAX_ARTIFACT_BYTES) throw new Error(`Approved plan artifact exceeds its size bound: ${relativePath}`);
    const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(file);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_ARTIFACT_BYTES) {
        throw new Error(`Approved plan artifact is not a regular single-link file: ${relativePath}`);
      }
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

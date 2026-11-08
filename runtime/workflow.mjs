import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';

const SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|crt)|credentials?(?:\..*)?|secrets?(?:\..*)?|\.ssh|\.aws|\.kube)(\/|$)|(^|\/)\.config\/(?:gcloud|aws)(\/|$)/i;
const MAX_WORKFLOW_BYTES = 1048576;
const RESERVED_WRITE_PATH = /(^|\/)(?:\.git|\.hyperflow)(\/|$)/i;
const CHECK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PROFILE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const EFFORT_ID = /^[a-z0-9][a-z0-9._+-]*$/i;

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a nonempty string`);
  return value;
}

function scopeList(value, label, write = false) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry) => {
    requireString(entry, label);
    if (entry.includes('\\') || isAbsolute(entry) || /^[A-Za-z]:/.test(entry)) throw new TypeError(`Unsafe ${label}: ${entry}`);
    if (entry.split('/').some((part) => part === '..' || part === '.')) throw new TypeError(`Unsafe ${label}: ${entry}`);
    const normalized = posix.normalize(entry);
    if (normalized === '..' || normalized.startsWith('../') || normalized === '.') throw new TypeError(`Unsafe ${label}: ${entry}`);
    if (SECRET_PATH.test(normalized)) throw new TypeError(`Secret path is not allowed in ${label}: ${entry}`);
    if (write && RESERVED_WRITE_PATH.test(normalized)) throw new TypeError(`Runtime metadata cannot be written by a task: ${entry}`);
    return normalized;
  });
}

function list(value, label, mapper) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map(mapper);
}

function rejectPrototypeKeys(value) {
  if (Array.isArray(value)) {
    for (const entry of value) rejectPrototypeKeys(entry);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new TypeError(`Unsafe object key: ${key}`);
    rejectPrototypeKeys(entry);
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalWorkflowJson(workflow) {
  return JSON.stringify(canonicalValue(validateWorkflow(workflow)));
}

export function serializeWorkflow(workflow) {
  return `export default ${canonicalWorkflowJson(workflow)};\n`;
}

export function parseWorkflow(source) {
  if (typeof source !== 'string') throw new TypeError('Workflow source must be text');
  if (Buffer.byteLength(source) > MAX_WORKFLOW_BYTES) throw new RangeError('Workflow declaration exceeds 1 MiB');
  const match = /^\s*export\s+default\s+([\s\S]*?)\s*;?\s*$/.exec(source);
  if (!match) throw new SyntaxError('Workflow must contain only one export default JSON declaration');
  let value;
  try { value = JSON.parse(match[1]); } catch (error) { throw new SyntaxError(`Invalid static workflow JSON: ${error.message}`); }
  rejectPrototypeKeys(value);
  return validateWorkflow(value);
}

function validateQuestion(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question)) throw new TypeError('Question must be an object');
  exactKeys(question, ['id', 'prompt', 'blocking', 'answer', 'recommendation', 'options', 'why', 'dependsOn'], 'question');
  if (typeof question.blocking !== 'boolean') throw new TypeError('question.blocking must be boolean');
  const result = { id: requireString(question.id, 'question.id'), prompt: requireString(question.prompt, 'question.prompt'), blocking: question.blocking === true };
  if (question.answer !== undefined) result.answer = requireString(question.answer, 'question.answer');
  if (question.recommendation !== undefined) result.recommendation = requireString(question.recommendation, 'question.recommendation');
  if (question.why !== undefined) result.why = requireString(question.why, 'question.why');
  if (question.options !== undefined) result.options = list(question.options, 'question.options', (option) => requireString(option, 'question option'));
  if (question.dependsOn !== undefined) result.dependsOn = list(question.dependsOn, 'question.dependsOn', (dependency) => requireString(dependency, 'question dependency'));
  return result;
}

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new TypeError('Task must be an object');
  exactKeys(task, ['id', 'title', 'agentRole', 'effort', 'reviewRole', 'reviewEffort', 'dependsOn', 'readScope', 'writeScope', 'acceptance', 'checks', 'resources'], 'task');
  const agentRole = requireString(task.agentRole, 'task.agentRole');
  if (!PROFILE_ID.test(agentRole)) throw new TypeError(`Invalid agent profile ID: ${agentRole}`);
  const effort = requireString(task.effort, 'task.effort');
  if (!EFFORT_ID.test(effort)) throw new TypeError(`Invalid task effort: ${effort}`);
  const result = {
    id: requireString(task.id, 'task.id'), title: requireString(task.title, 'task.title'), agentRole, effort,
    dependsOn: list(task.dependsOn, 'task.dependsOn', (item) => requireString(item, 'dependency')),
    readScope: scopeList(task.readScope, 'readScope'), writeScope: scopeList(task.writeScope, 'writeScope', true),
    acceptance: list(task.acceptance, 'task.acceptance', (item) => requireString(item, 'acceptance criterion')),
    checks: list(task.checks, 'task.checks', (item) => {
      requireString(item, 'check ID');
      if (!CHECK_ID.test(item)) throw new TypeError(`Invalid check ID: ${item}`);
      return item;
    }),
  };
  if (task.reviewRole !== undefined) {
    result.reviewRole = requireString(task.reviewRole, 'task.reviewRole');
    if (!PROFILE_ID.test(result.reviewRole)) throw new TypeError(`Invalid review profile ID: ${result.reviewRole}`);
  }
  if (task.reviewEffort !== undefined) {
    if (task.reviewRole === undefined) throw new TypeError('task.reviewEffort requires task.reviewRole');
    result.reviewEffort = requireString(task.reviewEffort, 'task.reviewEffort');
    if (!EFFORT_ID.test(result.reviewEffort)) throw new TypeError(`Invalid review effort: ${result.reviewEffort}`);
  }
  if (!result.acceptance.length) throw new TypeError('Each task needs an acceptance criterion');
  if (task.resources !== undefined) {
    if (!task.resources || typeof task.resources !== 'object' || Array.isArray(task.resources)) throw new TypeError('task.resources must be an object');
    exactKeys(task.resources, ['heavy', 'browserSpaces', 'simulators'], 'resource');
    const { heavy = false, browserSpaces = 0, simulators = 0 } = task.resources;
    if (typeof heavy !== 'boolean' || !Number.isInteger(browserSpaces) || browserSpaces < 0 || browserSpaces > 5 || !Number.isInteger(simulators) || simulators < 0 || simulators > 3) throw new TypeError('Invalid task resource requirements');
    result.resources = { heavy, browserSpaces, simulators };
  }
  return result;
}

export function validateWorkflow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Workflow must be an object');
  if (value.schemaVersion !== 1) throw new TypeError('Unsupported workflow schemaVersion');
  exactKeys(value, ['schemaVersion', 'id', 'goal', 'repository', 'tasks', 'questions', 'decisions'], 'workflow');
  const repository = value.repository;
  if (!repository || typeof repository !== 'object' || Array.isArray(repository)) throw new TypeError('Workflow repository identity is required');
  exactKeys(repository, ['root', 'baseSha'], 'repository');
  const workflow = {
    schemaVersion: 1, id: requireString(value.id, 'workflow.id'), goal: requireString(value.goal, 'workflow.goal'),
    repository: { root: requireString(repository.root, 'repository.root'), baseSha: requireString(repository.baseSha, 'repository.baseSha') },
    tasks: list(value.tasks, 'workflow.tasks', validateTask),
    questions: list(value.questions ?? [], 'workflow.questions', validateQuestion),
    decisions: list(value.decisions ?? [], 'workflow.decisions', (entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('Decision must be an object');
      exactKeys(entry, ['id', 'text', 'source'], 'decision');
      return { id: requireString(entry.id, 'decision.id'), text: requireString(entry.text, 'decision.text'), ...(entry.source ? { source: requireString(entry.source, 'decision.source') } : {}) };
    }),
  };
  if (!workflow.tasks.length) throw new TypeError('Workflow must contain at least one task');
  const questionIds = new Set(workflow.questions.map((question) => question.id));
  if (questionIds.size !== workflow.questions.length) throw new TypeError('Question IDs must be unique');
  for (const question of workflow.questions) {
    const dependencies = question.dependsOn ?? [];
    if (new Set(dependencies).size !== dependencies.length) throw new TypeError(`Duplicate question prerequisite for ${question.id}`);
    for (const dependency of dependencies) if (!questionIds.has(dependency) || dependency === question.id) throw new TypeError(`Unknown question prerequisite ${dependency}`);
  }
  const pendingQuestions = new Map(workflow.questions.map((question) => [question.id, question]));
  const resolvedQuestions = new Set();
  function visitQuestion(id) {
    if (resolvedQuestions.has(id)) return;
    const question = pendingQuestions.get(id);
    if (resolvedQuestions.has(`visiting:${id}`)) throw new TypeError('Question prerequisite graph contains a cycle');
    resolvedQuestions.add(`visiting:${id}`);
    for (const dependency of question.dependsOn ?? []) visitQuestion(dependency);
    resolvedQuestions.delete(`visiting:${id}`);
    resolvedQuestions.add(id);
  }
  for (const question of workflow.questions) visitQuestion(question.id);
  const decisionIds = new Set(workflow.decisions.map((decision) => decision.id));
  if (decisionIds.size !== workflow.decisions.length) throw new TypeError('Decision IDs must be unique');
  const ids = new Set(workflow.tasks.map((task) => task.id));
  if (ids.size !== workflow.tasks.length) throw new TypeError('Task IDs must be unique');
  for (const task of workflow.tasks) {
    if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new TypeError(`Duplicate dependency for ${task.id}`);
    for (const dependency of task.dependsOn) if (!ids.has(dependency) || dependency === task.id) throw new TypeError(`Invalid dependency ${dependency} for ${task.id}`);
  }
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(workflow.tasks.map((task) => [task.id, task]));
  function visit(id) {
    if (visiting.has(id)) throw new TypeError('Workflow dependency graph contains a cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of workflow.tasks) visit(task.id);
  return workflow;
}

export async function loadWorkflow(path) {
  const file = await open(path, 'r');
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > MAX_WORKFLOW_BYTES) throw new RangeError('Workflow file must be a regular file no larger than 1 MiB');
    const buffer = Buffer.alloc(MAX_WORKFLOW_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_WORKFLOW_BYTES) throw new RangeError('Workflow declaration exceeds 1 MiB');
    const workflow = parseWorkflow(buffer.subarray(0, bytesRead).toString('utf8'));
    return { workflow, digest: createHash('sha256').update(canonicalWorkflowJson(workflow)).digest('hex') };
  } finally { await file.close(); }
}

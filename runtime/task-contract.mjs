import { isAbsolute, posix } from 'node:path';

const SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|crt)|credentials?(?:\..*)?|secrets?(?:\..*)?|\.ssh|\.aws|\.kube)(\/|$)|(^|\/)\.config\/(?:gcloud|aws)(\/|$)/i;
const RESERVED_WRITE_PATH = /(^|\/)(?:\.git|\.hyperflow)(\/|$)/i;
export const CHECK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const PROFILE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const EFFORT_ID = /^[a-z0-9][a-z0-9._+-]*$/i;
export const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high']);
export const DIFFICULTIES = Object.freeze(['routine', 'complex', 'security']);
export const IMPLEMENTATION_ROUTING = { routine: 'lightweight', complex: 'general', security: 'general' };
export const CORRECTNESS_REVIEW_ROLE = 'primary';
export const SECURITY_LANE_ROLE = 'general';
const DETAILS_LIMIT_BYTES = 4096;
const SCHEMA2_TASK_KEYS = ['id', 'title', 'details', 'difficulty', 'agentRole', 'effort', 'reviewRole',
  'reviewEffort', 'dependsOn', 'readScope', 'writeScope', 'acceptance', 'checks', 'resources'];
const SCHEMA2_WORKFLOW_KEYS = ['schemaVersion', 'id', 'goal', 'repository', 'tasks', 'questions', 'decisions',
  'securityReviewEffort', 'securityFixEffort'];

export function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
}

export function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a nonempty string`);
  return value;
}

export function scopeList(value, label, write = false) {
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

export function list(value, label, mapper) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map(mapper);
}

export function optionalResources(task) {
  if (task.resources === undefined) return null;
  if (!task.resources || typeof task.resources !== 'object' || Array.isArray(task.resources)) throw new TypeError('task.resources must be an object');
  exactKeys(task.resources, ['heavy', 'browserSpaces', 'simulators'], 'resource');
  const { heavy = false, browserSpaces = 0, simulators = 0 } = task.resources;
  if (typeof heavy !== 'boolean' || !Number.isInteger(browserSpaces) || browserSpaces < 0 || browserSpaces > 5 ||
      !Number.isInteger(simulators) || simulators < 0 || simulators > 3) throw new TypeError('Invalid task resource requirements');
  return { heavy, browserSpaces, simulators };
}

export function effortLevel(value, label = 'effort') {
  if (!EFFORT_LEVELS.includes(value)) throw new TypeError(`${label} must be low, medium, or high`);
  return value;
}

function checkId(item, label) {
  requireString(item, label);
  if (!CHECK_ID.test(item)) throw new TypeError(`Invalid check ID: ${item}`);
  return item;
}

export function normalizeSchema2Task(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new TypeError('Task must be an object');
  exactKeys(task, SCHEMA2_TASK_KEYS, 'task');
  const id = requireString(task.id, 'task.id');
  if (!TASK_ID.test(id)) throw new TypeError(`Task ID must be a safe short identifier: ${id}`);
  const title = requireString(task.title, 'task.title');
  const details = requireString(task.details, 'task.details').trim();
  if (!details) throw new TypeError(`Task ${id} details must contain actual instructions`);
  if (Buffer.byteLength(details) > DETAILS_LIMIT_BYTES) throw new TypeError(`Task ${id} details exceed ${DETAILS_LIMIT_BYTES} bytes`);
  const difficulty = task.difficulty === undefined ? 'routine' : task.difficulty;
  if (!DIFFICULTIES.includes(difficulty)) throw new TypeError(`Invalid task difficulty: ${difficulty}`);
  const agentRole = task.agentRole === undefined ? IMPLEMENTATION_ROUTING[difficulty] : task.agentRole;
  if (agentRole !== IMPLEMENTATION_ROUTING[difficulty]) {
    throw new TypeError(`Task ${id} routes ${difficulty} work through ${IMPLEMENTATION_ROUTING[difficulty]}, not ${agentRole}`);
  }
  const effort = effortLevel(requireString(task.effort, 'task.effort'), `task ${id} effort`);
  const reviewRole = task.reviewRole === undefined ? CORRECTNESS_REVIEW_ROLE : task.reviewRole;
  if (reviewRole !== CORRECTNESS_REVIEW_ROLE) {
    throw new TypeError(`Task ${id} correctness review uses the ${CORRECTNESS_REVIEW_ROLE} role, not ${reviewRole}`);
  }
  const reviewEffort = task.reviewEffort === undefined ? 'high' : effortLevel(task.reviewEffort, `task ${id} review effort`);
  const result = {
    id, title, details, difficulty, agentRole, effort, reviewRole, reviewEffort,
    dependsOn: list(task.dependsOn, 'task.dependsOn', (item) => requireString(item, 'dependency')),
    readScope: scopeList(task.readScope, 'readScope'), writeScope: scopeList(task.writeScope, 'writeScope', true),
    acceptance: list(task.acceptance, 'task.acceptance', (item) => requireString(item, 'acceptance criterion')),
    checks: list(task.checks, 'task.checks', (item) => checkId(item, 'check ID')),
  };
  const resources = optionalResources(task);
  if (resources) result.resources = resources;
  if (!result.acceptance.length) throw new TypeError('Each task needs an acceptance criterion');
  return result;
}

export function securityEffortFields(value) {
  return {
    securityReviewEffort: value.securityReviewEffort === undefined ? 'high' : effortLevel(value.securityReviewEffort, 'workflow.securityReviewEffort'),
    securityFixEffort: value.securityFixEffort === undefined ? 'high' : effortLevel(value.securityFixEffort, 'workflow.securityFixEffort'),
  };
}

export function schema2WorkflowKeys() {
  return [...SCHEMA2_WORKFLOW_KEYS];
}

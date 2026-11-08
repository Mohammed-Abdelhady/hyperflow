import { createHash } from 'node:crypto';

const PROFILE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DEFAULT_PROFILES = {
  primary: { model: 'gpt-6.1-sol', adapter: 'codex' },
  general: { model: 'zai/glm-5.3', adapter: 'opencode' },
  lightweight: { model: 'zai/glm-5.3-flash', adapter: 'opencode' },
};
const ADAPTER_ALIASES = new Map([
  ['opencode', 'opencode'], ['open-code', 'opencode'],
  ['codex', 'codex'],
  ['claude-code', 'claude-code'], ['claude_code', 'claude-code'], ['claudecode', 'claude-code'], ['claude', 'claude-code'],
  ['antigravity', 'antigravity'], ['agy', 'antigravity'],
  ['cursor', 'cursor'], ['cursor-agent', 'cursor'],
  ['pi', 'pi'],
]);

function normalizeAdapter(value) {
  if (typeof value !== 'string') throw new TypeError('Model adapter must be a string');
  const adapter = ADAPTER_ALIASES.get(value.toLowerCase());
  if (!adapter) throw new TypeError(`Unsupported model adapter: ${value}`);
  return adapter;
}

function normalizeModelId(value, adapter) {
  if (typeof value !== 'string') throw new TypeError(`Invalid ${adapter} model ID: ${value}`);
  const valid = adapter === 'opencode'
    ? /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:/-]*$/i.test(value)
    : /^[a-z0-9][a-z0-9._:/-]*$/i.test(value);
  if (typeof value !== 'string' || !valid) throw new TypeError(`Invalid ${adapter} model ID: ${value}`);
  return value;
}

function stringList(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const values = value.map((entry) => {
    const normalized = typeof entry === 'string' ? entry : entry?.id;
    if (typeof normalized !== 'string' || !normalized.trim()) throw new TypeError(`Invalid ${label} entry`);
    return normalized;
  });
  return [...new Set(values)];
}

function catalogEntries(catalog) {
  if (!Array.isArray(catalog)) throw new TypeError('Model catalog must be an array');
  const entries = catalog.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('Catalog entries must be normalized objects');
    const adapter = normalizeAdapter(entry.adapter);
    const id = normalizeModelId(entry.id, adapter);
    const capabilities = stringList(entry.capabilities ?? [], 'capabilities');
    const efforts = stringList(entry.efforts ?? entry.variants, 'efforts');
    return { id, adapter, capabilities, efforts };
  });
  const keys = entries.map((entry) => `${entry.adapter}\u0000${entry.id}`);
  if (new Set(keys).size !== keys.length) throw new TypeError('Model catalog contains duplicate adapter/model bindings');
  return entries;
}

function bindingKey(adapter, model) {
  return `${adapter}\u0000${model}`;
}

function validateBinding(value, profile, catalog) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Invalid model binding for ${profile}`);
  for (const key of Object.keys(value)) if (!['model', 'adapter', 'variant', 'capabilities'].includes(key)) throw new TypeError(`Unknown model binding field: ${key}`);
  const adapter = normalizeAdapter(value.adapter);
  const model = normalizeModelId(value.model, adapter);
  const entry = catalog.find((item) => item.id === model && item.adapter === adapter);
  if (!entry) throw new TypeError(`Model is unavailable for ${profile}: ${adapter}/${model}`);
  const capabilities = value.capabilities ?? [];
  if (!Array.isArray(capabilities) || !capabilities.every((capability) => typeof capability === 'string' && entry.capabilities.includes(capability))) throw new TypeError(`Model lacks a required capability for ${profile}`);
  const result = { model, adapter };
  if (value.variant !== undefined) {
    if (typeof value.variant !== 'string' || !entry.efforts?.includes(value.variant)) throw new TypeError(`Unsupported model variant for ${adapter}/${model}`);
    result.variant = value.variant;
  }
  return result;
}

function validateProfiles(layer, label) {
  if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw new TypeError(`${label} profile overlay must be an object`);
  for (const profile of Object.keys(layer)) if (!PROFILE_ID.test(profile)) throw new TypeError(`Invalid profile ID: ${profile}`);
}

export function resolveRoles({ global = {}, project = {}, session = {}, catalog: sourceCatalog }) {
  const catalog = catalogEntries(sourceCatalog);
  const layers = [['global', global], ['project', project], ['session', session]];
  for (const [label, layer] of layers) validateProfiles(layer, label);
  const preferences = new Map();
  const sources = {};
  for (const [profile, binding] of Object.entries(DEFAULT_PROFILES)) {
    preferences.set(profile, binding);
    sources[profile] = 'default';
  }
  for (const [label, layer] of layers) {
    for (const [profile, binding] of Object.entries(layer)) {
      preferences.set(profile, binding);
      sources[profile] = label;
    }
  }
  const roles = {};
  const unavailableDefaults = [];
  for (const [profile, preference] of preferences) {
    const adapter = normalizeAdapter(preference?.adapter);
    const model = normalizeModelId(preference?.model, adapter);
    const available = catalog.some((entry) => entry.id === model && entry.adapter === adapter);
    if (!available && Object.hasOwn(DEFAULT_PROFILES, profile) && sources[profile] === 'default') {
      unavailableDefaults.push({ profile, adapter, model });
      continue;
    }
    roles[profile] = validateBinding(preference, profile, catalog);
  }
  const canonicalRoles = Object.fromEntries(Object.entries(roles).sort(([left], [right]) => left.localeCompare(right)));
  const revisionInput = JSON.stringify({ roles: canonicalRoles, sources, unavailableDefaults });
  return {
    revision: createHash('sha256').update(revisionInput).digest('hex'),
    roles: canonicalRoles,
    sources: Object.fromEntries(Object.keys(canonicalRoles).map((profile) => [profile, sources[profile]])),
    unavailableDefaults,
  };
}

function validateEffort(binding, effort, catalog) {
  if (effort === undefined || catalog === undefined) return;
  const normalized = catalogEntries(catalog).find((entry) => entry.adapter === binding.adapter && entry.id === binding.model);
  if (normalized?.efforts && !normalized.efforts.includes(effort)) throw new TypeError(`Effort ${effort} is unavailable for ${binding.adapter}/${binding.model}`);
}

export function validateTaskBinding(task, roles, catalog) {
  if (!task || typeof task !== 'object' || !roles || typeof roles !== 'object') throw new TypeError('Task and resolved profiles are required');
  if (typeof task.effort !== 'string' || !task.effort.trim()) throw new TypeError('Task effort must be explicitly assigned');
  if (task.reviewEffort !== undefined && task.reviewRole === undefined) throw new TypeError('Review effort requires a review profile');
  const profiles = roles.roles ?? roles;
  const binding = profiles[task.agentRole];
  if (!binding) throw new TypeError(`Unknown task profile: ${task.agentRole}`);
  validateEffort(binding, task.effort, catalog);
  const assignment = {
    profile: task.agentRole, ...binding, effort: task.effort,
    source: roles.sources?.[task.agentRole] ?? 'configured',
  };
  if (task.reviewRole !== undefined) {
    const reviewBinding = profiles[task.reviewRole];
    if (!reviewBinding) throw new TypeError(`Unknown review profile: ${task.reviewRole}`);
    validateEffort(reviewBinding, task.reviewEffort, catalog);
    assignment.review = { profile: task.reviewRole, ...reviewBinding, ...(task.reviewEffort ? { effort: task.reviewEffort } : {}) };
  }
  return assignment;
}

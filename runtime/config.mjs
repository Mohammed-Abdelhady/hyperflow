import { existsSync, mkdirSync } from 'node:fs';
import { readJson, writeJson } from './files.mjs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveRoles } from './models.mjs';

export const GLOBAL_CONFIG_PATH = process.env.HYPERFLOW_CONFIG_PATH ?? join(homedir(), '.config/hyperflow/agents.json');
const PROFILE_ID = /^[a-z][a-z0-9-]{0,63}$/;

export function readConfiguration(path) {
  if (!existsSync(path)) return {};
  const value = readJson(path);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid role configuration');
  return value;
}

export function effectiveRoles({ repoRoot, catalog, globalPath = GLOBAL_CONFIG_PATH, session = {} }) {
  return resolveRoles({ global: readConfiguration(globalPath), project: readConfiguration(join(repoRoot, '.hyperflow/agents.json')),
    session, catalog });
}

export function setRole({ path, role, model, harness, catalog, current = {} }) {
  if (!PROFILE_ID.test(role)) throw new Error('Unknown model role');
  const updated = { ...readConfiguration(path), [role]: { model, adapter: harness } };
  const validated = resolveRoles({ global: current, project: updated, catalog });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeJson(path, updated);
  return validated;
}

export function configuredProfiles(repoRoot, session = {}) {
  return Object.values({ ...readConfiguration(GLOBAL_CONFIG_PATH),
    ...readConfiguration(join(repoRoot, '.hyperflow/agents.json')), ...session })
    .filter((profile) => profile && typeof profile === 'object');
}

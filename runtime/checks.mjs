import { existsSync } from 'node:fs';
import { readJson } from './files.mjs';
import { join } from 'node:path';

export function loadChecks(repoRoot) {
  const path = join(repoRoot, '.hyperflow/checks.json');
  if (!existsSync(path)) return {};
  const checks = readJson(path);
  if (!checks || Array.isArray(checks) || typeof checks !== 'object') throw new Error('Invalid check registry');
  for (const [id, check] of Object.entries(checks)) {
    if (!/^[A-Za-z0-9][\w.-]*$/.test(id) || !check || typeof check.command !== 'string' || !check.command.trim() ||
        !Array.isArray(check.args) || check.args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      throw new Error(`Invalid check: ${id}`);
    }
    if (check.cwd && (typeof check.cwd !== 'string' || check.cwd.startsWith('/') || check.cwd.split(/[\\/]/).includes('..'))) {
      throw new Error(`Check working directory escapes repository: ${id}`);
    }
  }
  return checks;
}

export function validateChecks(workflow, checks) {
  for (const task of workflow.tasks) {
    if (!task.checks.length) throw new Error(`Task ${task.id} has no verification checks`);
    for (const id of task.checks) if (!Object.hasOwn(checks, id)) throw new Error(`Unknown check ${id} in task ${task.id}`);
  }
}

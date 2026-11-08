import { join } from 'node:path';
import { RunStore } from './store.mjs';
import { artifactPath, readJson, SLUG } from './files.mjs';
import { discoverCatalog } from './catalog.mjs';
import { effectiveRoles, GLOBAL_CONFIG_PATH, setRole, configuredProfiles } from './config.mjs';
import { resolveRoles } from './models.mjs';

export function statePath(root) { return artifactPath(root, 'runtime.sqlite'); }

export function taskGraph(run) {
  return { runId: run.id ?? run.runId, nodes: run.workflow.tasks.map((task) => ({ id: task.id,
    title: task.title, role: task.agentRole, dependsOn: task.dependsOn })) };
}

export async function controlCommand(command, args, root) {
  if (command === 'agents-config') return configure(args, root);
  const store = new RunStore(statePath(root));
  try {
    if (command === 'sessions') {
      if (args.length) throw new Error('Usage: sessions');
      return store.listRuns();
    }
    const [id, ...rest] = args;
    if (!SLUG.test(id ?? '')) throw new Error('A specific run ID is required');
    if (command === 'rename') {
      if (rest.length !== 1) throw new Error('Usage: rename <run-id> <name>');
      return store.rename(id, rest[0]);
    }
    if (command === 'messages') {
      if (rest.length > 1) throw new Error('Usage: messages <run-id> [message.json]');
      return rest.length ? store.sendMessage(id, readJson(rest[0])) : store.messages(id);
    }
    if (rest.length) throw new Error(`Usage: ${command} <run-id>`);
    if (command === 'stop') return store.stop(id);
    const run = store.getRun(id);
    if (command === 'graph') return taskGraph(run);
    return run;
  } finally { store.close(); }
}

async function configure(args, root) {
  const [action, role, harness, model, scope = 'project', runId] = args;
  const configured = configuredProfiles(root);
  if (action === 'set') configured.push({ adapter: harness, model });
  const catalog = await discoverCatalog({ cwd: root, configured });
  const effective = effectiveRoles({ repoRoot: root, catalog });
  if (!args.length) return { ...effective, catalog };
  if (action !== 'set' || args.length < 4 || args.length > 6) {
    throw new Error('Usage: agents-config set <profile> <harness> <model> [project|global|session run-id]');
  }
  if (scope === 'session') {
    if (!SLUG.test(runId ?? '')) throw new Error('Session scope requires a run ID');
    const store = new RunStore(statePath(root));
    try {
      const current = store.getRun(runId);
      const updated = resolveRoles({ global: current.roles, session: { [role]: { model, adapter: harness } }, catalog });
      return store.setRoles(runId, updated);
    } finally { store.close(); }
  }
  if (!['global', 'project'].includes(scope) || runId) throw new Error('Invalid configuration scope');
  const path = scope === 'global' ? GLOBAL_CONFIG_PATH : artifactPath(root, 'agents.json');
  return setRole({ path, role, model, harness, catalog, current: effective.roles });
}

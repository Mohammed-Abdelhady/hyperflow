import { existsSync, mkdirSync, mkdtempSync, writeFileSync, readdirSync, rmSync, lstatSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { readJson } from './files.mjs';
import { runProcess } from './process.mjs';
import { runPiTask } from './pi-adapter.mjs';

const TIMEOUT_MS = 600_000;
const MAX_RETAINED_RUNS = 100;
const MAX_BRIEF_BYTES = 32_768;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const STATUS = new Set(['completed', 'failed', 'timeout', 'aborted', 'opencode_unavailable', 'codex_unavailable', 'claude_unavailable', 'agy_unavailable', 'cursor_agent_unavailable', 'pi_unavailable', 'stalled']);
const HARNESSES = new Set(['opencode', 'codex', 'claude-code', 'antigravity', 'cursor', 'pi']);

export function installedRelay(harness = 'opencode', home = homedir()) {
  const skill = ({ 'claude-code': 'claude', antigravity: 'agy' })[harness] ?? harness;
  const options = [process.env[`HYPERFLOW_${skill.toUpperCase()}_RELAY`], process.env.HYPERFLOW_RELAY,
    join(home, '.local/share/hyperflow/delegate-skills', `${skill}-relay.mjs`),
    join(home, `.agents/skills/${skill}-delegate/scripts/relay.mjs`),
    join(home, `.codex/skills/${skill}-delegate/scripts/relay.mjs`)].filter(Boolean);
  const selected = options.find((path) => existsSync(path));
  if (!selected) throw new Error('Delegate relay unavailable. Run hyperflow setup-delegates or configure HYPERFLOW_RELAY.');
  return selected;
}

function boundedResult(path) {
  const result = readJson(path);
  if (result.schema !== 'delegate-relay.result.v1' || !STATUS.has(result.status) ||
      typeof result.finalMessage !== 'string' || !(Number.isInteger(result.exitCode) || result.exitCode === null)) {
    throw new Error('Delegate result protocol is invalid');
  }
  return result;
}

function modelBinding(model) {
  const selected = typeof model === 'string' ? { model, adapter: 'opencode' } : model;
  if (!HARNESSES.has(selected?.adapter) || typeof selected.model !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:@~/#-]*$/.test(selected.model) ||
      (selected.adapter === 'opencode' && !selected.model.includes('/'))) {
    throw new Error('An available harness and model binding is required');
  }
  return selected;
}

export function pruneRelayArtifacts(root, now = Date.now()) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (lstatSync(root).isSymbolicLink()) throw new Error('Artifact directory cannot be a symlink');
  let retained = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.name.startsWith('run-')) continue;
    const directory = join(root, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Invalid relay artifact entry');
    const marker = join(directory, 'retention.json');
    if (existsSync(marker)) {
      const metadata = readJson(marker);
      if (metadata.completed === true && Number.isFinite(metadata.expiresAt) && metadata.expiresAt < now) {
        rmSync(directory, { recursive: true, force: true });
        continue;
      }
    }
    retained += 1;
  }
  if (retained >= MAX_RETAINED_RUNS) throw new Error('Relay evidence capacity reached; archive old owned run directories before continuing.');
}

export function createAdapter({ relayPath, piCommand = 'pi', outRoot = join(tmpdir(), 'hyperflow-runs'), readOnly = false,
  timeoutMs = TIMEOUT_MS } = {}) {
  return async ({ task, cwd, model, signal, context, attempt = 1 }) => {
    const selected = modelBinding(model);
    const effort = task.effort;
    if (effort !== undefined && (typeof effort !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(effort))) throw new Error('Invalid planned effort');
    if (selected.adapter === 'cursor' && effort !== 'harness-default') throw new Error('This relay does not expose a separate effort control; plan harness-default explicitly.');
    const relay = selected.adapter === 'pi' ? null : relayPath ?? installedRelay(selected.adapter);
    const brief = [
      `Task ${task.id}: ${task.title}`, `Attempt: ${attempt}`,
      `Details: ${task.details ?? task.title}`,
      `Allowed writes: ${JSON.stringify(readOnly ? [] : task.writeScope ?? [])}`,
      `Acceptance: ${JSON.stringify(task.acceptance ?? [])}`,
      readOnly ? 'Read only. Do not edit files, commit, install packages or execute unapproved commands.' :
        'Implement only the assigned scope. Do not commit, push, modify secrets or change workflow state.',
      'Work unattended. Resolve routine decisions from the approved plan and repository. Do not ask questions or wait for input. Report blockers with evidence if completion is impossible.',
      'Never read environment files, private keys, certificates, SSH material, cloud credentials, or Kubernetes configuration.',
      context ?? '',
    ].join('\n');
    if (Buffer.byteLength(brief) > MAX_BRIEF_BYTES) throw new Error('Delegate brief exceeds the context bound');
    pruneRelayArtifacts(outRoot);
    const output = mkdtempSync(join(outRoot, 'run-'));
    const briefPath = join(output, 'brief.md');
    writeFileSync(briefPath, brief, { mode: 0o600 });
    const args = [relay, '--brief', briefPath, '--cd', cwd, '--model', selected.model,
      '--out-dir', output, '--timeout', `${Math.ceil(timeoutMs / 1000)}s`];
    if (selected.adapter === 'opencode') args.push('--agent', readOnly ? 'plan' : 'build');
    if (readOnly) args.push('--read-only');
    else {
      if (selected.adapter === 'codex') args.push('--sandbox', 'danger-full-access');
      if (['claude-code', 'antigravity'].includes(selected.adapter)) args.push('--dangerously-skip-permissions');
      if (selected.adapter === 'cursor') args.push('--sandbox', 'disabled');
    }
    if (effort !== undefined && effort !== 'harness-default') {
      args.push(selected.adapter === 'opencode' ? '--variant' : '--effort', effort);
    }
    try {
    let execution;
    if (selected.adapter === 'pi') {
      const native = await runPiTask({ command: piCommand, cwd, model: selected.model, effort,
        brief, readOnly, signal, timeoutMs });
      writeFileSync(join(output, 'result.json'), JSON.stringify(native), { mode: 0o600 });
      execution = { code: native.exitCode, stderr: '' };
    } else execution = await runProcess(process.execPath, args, { cwd, signal, timeoutMs });
    const resultPath = join(output, 'result.json');
    if (!existsSync(resultPath)) throw new Error(`Delegate exited ${execution.code} without a result. ${execution.stderr.slice(-1000)}`);
    const result = boundedResult(resultPath);
    if (result.model !== selected.model ||
        (selected.adapter === 'opencode' && result.agent !== (readOnly ? 'plan' : 'build')) ||
        (effort !== undefined && effort !== 'harness-default' && (selected.adapter === 'opencode' ? result.variant : result.effort) !== effort)) {
      throw new Error('Delegate did not confirm the requested model and agent');
    }
    const actualModel = result.actualModel ?? result.resolvedModel ?? null;
    if (actualModel && selected.model !== 'auto' && actualModel !== selected.model &&
        `${result.actualProvider}/${actualModel}` !== selected.model) throw new Error('Harness reported a different actual model');
    const completed = result.readOnlyViolation !== true && result.status === 'completed' && result.exitCode === 0 && execution.code === 0;
    return { status: completed ? 'completed' : 'failed', sessionId: result.sessionId ?? result.threadId ?? result.conversationId,
      summary: result.finalMessage, touchedFiles: result.touchedFiles, artifacts: [resultPath],
      model: selected.model, actualModel, adapter: selected.adapter, requestedEffort: effort ?? null,
      appliedEffort: result.appliedEffort ?? null, failure: completed ? null : result.status, retentionDays: 7 };
    } finally {
      rmSync(briefPath, { force: true });
      writeFileSync(join(output, 'retention.json'), JSON.stringify({ completed: true, expiresAt: Date.now() + RETENTION_MS }), { mode: 0o600 });
    }
  };
}

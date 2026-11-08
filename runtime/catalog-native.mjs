import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { childEnvironment, runProcess } from './process.mjs';
import { EFFORT_LEVELS } from './task-contract.mjs';

const DISCOVERY_TIMEOUT_MS = 15_000;
const MAX_PAGES = 10;
const MAX_MESSAGE_BYTES = 1_048_576;

export async function discoverCodexModels({ cwd = process.cwd(), signal } = {}) {
  signal?.throwIfAborted();
  const child = spawn('codex', ['app-server', '--stdio'], { cwd, env: childEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
  const responses = new Map();
  let terminalError;
  const fail = (error) => {
    terminalError = error;
    for (const { reject } of responses.values()) reject(error);
    responses.clear();
  };
  child.once('error', fail);
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    try {
      if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) throw new Error('Codex catalog response exceeds limit');
      const message = JSON.parse(line);
      if (message.id === undefined) return;
      const pending = responses.get(message.id);
      if (!pending) throw new Error('Unexpected Codex discovery response');
      responses.delete(message.id);
      if (message.error) pending.reject(new Error('Codex model discovery failed'));
      else pending.resolve(message.result);
    } catch (error) { fail(error); }
  });
  child.once('close', () => fail(new Error('Codex catalog closed before completion')));
  const abort = () => { fail(signal?.reason ?? new Error('Codex model discovery timed out')); child.kill('SIGTERM'); };
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, DISCOVERY_TIMEOUT_MS).unref();
  let nextId = 1;
  const request = (method, params) => new Promise((resolve, reject) => {
    if (terminalError) { reject(terminalError); return; }
    const id = nextId++;
    responses.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  try {
    await request('initialize', { clientInfo: { name: 'hyperflow', version: '7.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write('{"method":"initialized"}\n');
    let cursor;
    const seen = new Set();
    const catalog = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const value = await request('model/list', { limit: 100, includeHidden: true, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(value?.data)) throw new Error('Invalid Codex catalog');
      for (const entry of value.data) {
        if (typeof entry.model !== 'string' || !Array.isArray(entry.supportedReasoningEfforts)) throw new Error('Invalid Codex model descriptor');
        catalog.push({ id: entry.model, adapter: 'codex', variants: entry.supportedReasoningEfforts.map((item) => item.reasoningEffort),
          capabilities: ['implementation', 'review'], source: 'native-catalog' });
      }
      if (!value.nextCursor) return catalog;
      if (seen.has(value.nextCursor)) throw new Error('Codex catalog repeated a page');
      cursor = value.nextCursor; seen.add(cursor);
    }
    throw new Error('Codex model discovery exceeded its page bound');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    lines.close();
    child.stdin.end();
    child.kill('SIGTERM');
  }
}

export async function configuredClaudeModels(configured, { cwd, signal } = {}) {
  const version = await runProcess('claude', ['--version'], { cwd, signal, timeoutMs: DISCOVERY_TIMEOUT_MS });
  if (version.code !== 0) throw new Error('Claude Code is unavailable');
  const match = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(version.stdout);
  const supportsUltra = match && (Number(match[1]) > 2 || (Number(match[1]) === 2 &&
    (Number(match[2]) > 1 || (Number(match[2]) === 1 && Number(match[3]) >= 203))));
  return configured.filter((item) => (item.adapter ?? item.harness) === 'claude-code').map((item) => ({
    id: item.model, adapter: 'claude-code', effortSupport: 'unknown', cliVersion: version.stdout.trim(),
    acceptedEffortTokens: ['low', 'medium', 'high', 'xhigh', 'max', ...(supportsUltra ? ['ultracode'] : [])],
    tokenValidation: 'relay-only',
    source: 'user-configured', availability: 'validated-on-dispatch', capabilities: ['implementation', 'review'],
  }));
}

export async function configuredHarnessModels(harness, configured, { cwd, signal } = {}) {
  const command = { antigravity: 'agy', cursor: 'cursor-agent', pi: 'pi' }[harness];
  const version = await runProcess(command, ['--version'], { cwd, signal, timeoutMs: DISCOVERY_TIMEOUT_MS });
  if (version.code !== 0) throw new Error(`${harness} is unavailable`);
  let preferences = configured.filter((item) => (item.adapter ?? item.harness) === harness);
  if (harness === 'antigravity') {
    const list = await runProcess(command, ['models'], { cwd, signal, timeoutMs: DISCOVERY_TIMEOUT_MS });
    if (list.code !== 0) throw new Error('Antigravity model discovery failed');
    const models = list.stdout.split(/\r?\n/).map((line) => line.split('\t')[0].trim())
      .filter((model) => /^[a-zA-Z0-9][a-zA-Z0-9._:/-]+$/.test(model));
    preferences = models.map((model) => ({ model }));
  }
  return preferences.map((item) => ({
    id: item.model, adapter: harness, source: 'user-configured', availability: 'validated-on-dispatch',
    effortSupport: harness === 'antigravity' ? 'unknown' : harness === 'pi' ? 'native' : 'unsupported',
    acceptedEffortTokens: ['antigravity', 'pi'].includes(harness) ? [...EFFORT_LEVELS] : ['harness-default'],
    variants: harness === 'antigravity' ? undefined : harness === 'pi' ? [...EFFORT_LEVELS] : ['harness-default'],
    cliVersion: version.stdout.trim(), capabilities: ['implementation', 'review'],
  }));
}

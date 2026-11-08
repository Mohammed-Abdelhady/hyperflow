import { spawn } from 'node:child_process';
import { delimiter, dirname } from 'node:path';

const MAX_OUTPUT_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 600_000;
const TERMINATE_GRACE_MS = 2_000;

export function childEnvironment() {
  const entries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return { ...process.env, PATH: [...new Set([...entries, dirname(process.execPath)])].join(delimiter) };
}

export function runProcess(command, args, { cwd, signal, timeoutMs = DEFAULT_TIMEOUT_MS, env, input } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: env ?? childEnvironment(), detached: process.platform !== 'win32',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let reason;
    let forceTimer;
    const terminate = () => {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch (error) { if (error.code !== 'ESRCH') reason ??= error; }
      forceTimer ??= setTimeout(() => {
        try {
          if (process.platform === 'win32') child.kill('SIGKILL');
          else process.kill(-child.pid, 'SIGKILL');
        } catch { /* The process may already have exited. */ }
      }, TERMINATE_GRACE_MS).unref();
    };
    const abort = () => { reason ??= signal.reason ?? new Error('Run cancelled'); terminate(); };
    const timer = setTimeout(() => { reason ??= new Error('Process timed out'); terminate(); }, timeoutMs).unref();
    const capture = (field, data) => {
      const value = field === 'stdout' ? stdout : stderr;
      if (Buffer.byteLength(value) + data.length > MAX_OUTPUT_BYTES) {
        reason ??= new Error('Process output exceeded its bound'); terminate(); return;
      }
      if (field === 'stdout') stdout += data.toString('utf8');
      else stderr += data.toString('utf8');
    };
    child.stdout.on('data', (data) => capture('stdout', data));
    child.stderr.on('data', (data) => capture('stderr', data));
    signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(timer); clearTimeout(forceTimer); signal?.removeEventListener('abort', abort); };
    child.once('error', (error) => { cleanup(); reject(error); });
    child.once('close', (code, terminationSignal) => {
      cleanup();
      if (reason) reject(reason);
      else resolve({ code, signal: terminationSignal, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.on('error', (error) => { reason ??= error; terminate(); });
      child.stdin.end(input);
    }
    if (signal?.aborted) abort();
  });
}

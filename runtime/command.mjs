import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export async function runChecks(task, registry, cwd, signal, evidenceDirectory) {
  const receipts = [];
  for (const checkId of task.checks ?? []) {
    const check = registry[checkId];
    if (!check || typeof check.command !== 'string' || !Array.isArray(check.args) || check.args.some(arg => typeof arg !== 'string')) {
      throw new Error(`Missing or invalid registered check: ${checkId}`);
    }
    const taskRoot = await realpath(cwd);
    if (check.cwd && (path.isAbsolute(check.cwd) || check.cwd.split(/[\\/]/).includes('..'))) throw new Error(`Check ${checkId} cwd must be a safe relative path`);
    const checkCwd = await realpath(check.cwd ? path.resolve(taskRoot, check.cwd) : taskRoot);
    if (checkCwd !== taskRoot && !checkCwd.startsWith(`${taskRoot}${path.sep}`)) throw new Error(`Check ${checkId} cwd must stay inside its worktree`);
    receipts.push(await runCommand(checkId, check.command, check.args, checkCwd, signal, evidenceDirectory));
  }
  return receipts;
}

async function runCommand(checkId, command, args, cwd, signal, evidenceDirectory) {
  const prefix = `${checkId.replace(/[^A-Za-z0-9._-]/g, '_')}-${randomUUID()}`;
  await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
  const stdoutPath = path.join(evidenceDirectory, `${prefix}.stdout.log`);
  const stderrPath = path.join(evidenceDirectory, `${prefix}.stderr.log`);
  const stdout = createWriteStream(stdoutPath, { flags: 'wx', mode: 0o600 });
  const stderr = createWriteStream(stderrPath, { flags: 'wx', mode: 0o600 });
  try {
    const exitCode = await spawnCommand(command, args, cwd, signal, stdout, stderr, checkId);
    const receipt = { checkId, command, args, cwd, exitCode, stdoutRef: stdoutPath, stderrRef: stderrPath };
    if (exitCode !== 0) throw Object.assign(new Error(`Check ${checkId} exited ${exitCode}`), { evidence: receipt });
    return receipt;
  } catch (error) {
    stdout.destroy();
    stderr.destroy();
    throw error;
  }
}

function spawnCommand(command, args, cwd, signal, stdout, stderr, checkId) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('Execution stopped'));
    const detached = process.platform !== 'win32';
    const child = spawn(command, args, { cwd, shell: false, detached, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    const terminate = () => {
      try { process.kill(detached ? -child.pid : child.pid, 'SIGTERM'); }
      catch { child.kill('SIGTERM'); }
    };
    const aborted = () => terminate();
    signal?.addEventListener('abort', aborted, { once: true });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    child.on('error', error => { if (!settled) { settled = true; reject(error); } });
    child.on('close', code => {
      signal?.removeEventListener('abort', aborted);
      Promise.all([finished(stdout), finished(stderr)]).then(() => {
        if (settled) return;
        settled = true;
        if (signal?.aborted) reject(signal.reason ?? new Error('Execution stopped'));
        else resolve(code ?? 1);
      }, reject);
    });
    if (signal?.aborted) terminate();
  });
}

function finished(stream) {
  if (stream.writableFinished) return Promise.resolve();
  return new Promise((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });
}

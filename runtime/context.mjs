import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, posix } from 'node:path';

const MAX_CONTEXT_BYTES = 32768;
const MAX_SOURCE_FILES = 100;
const SECRET_PATH = /(^|\/)(?:\.env(?:\..*)?|[^/]+\.(?:pem|key|crt)|credentials?(?:\..*)?|secrets?(?:\..*)?|\.ssh|\.aws|\.kube)(\/|$)|(^|\/)\.config\/(?:gcloud|aws)(\/|$)/i;

function safeRelative(input) {
  if (typeof input !== 'string' || !input.trim() || input.includes('\\') || isAbsolute(input) || /^[A-Za-z]:/.test(input)) throw new TypeError(`Unsafe repository path: ${input}`);
  const parts = input.split('/');
  if (parts.some((part) => part === '..' || part === '.' || part === '')) throw new TypeError(`Unsafe repository path: ${input}`);
  const normalized = posix.normalize(input);
  if (SECRET_PATH.test(normalized)) throw new TypeError(`Secret path is not allowed: ${input}`);
  return normalized;
}

function assertInside(root, candidate) {
  const rel = relative(root, candidate);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new TypeError(`Path escapes repository: ${candidate}`);
}

async function inspectPath(root, relativePath, found) {
  const safePath = safeRelative(relativePath);
  const absolute = resolve(root, safePath);
  assertInside(root, absolute);
  await assertNoSymlinkAncestors(root, safePath);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) throw new TypeError(`Symlink sources are not allowed: ${safePath}`);
  if (metadata.isDirectory()) {
    const entries = (await readdir(absolute)).sort();
    for (const entry of entries) await inspectPath(root, `${safePath}/${entry}`, found);
    return;
  }
  if (!metadata.isFile()) return;
  if (found.length >= MAX_SOURCE_FILES) throw new RangeError('Context contains too many source files');
  found.push(safePath);
}

async function assertNoSymlinkAncestors(root, relativePath) {
  const segments = relativePath.split('/');
  let current = root;
  for (const segment of segments) {
    current = resolve(current, segment);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new TypeError(`Symlink sources are not allowed: ${relativePath}`);
  }
}

async function readVerified(root, relativePath) {
  const safePath = safeRelative(relativePath);
  const absolute = resolve(root, safePath);
  assertInside(root, absolute);
  await assertNoSymlinkAncestors(root, safePath);
  const canonical = await realpath(absolute);
  assertInside(root, canonical);
  const canonicalPath = safeRelative(relative(root, canonical).split(sep).join('/'));
  const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.nlink !== 1) throw new TypeError(`Context source must be a single-link regular file: ${canonicalPath}`);
    if (metadata.size > MAX_CONTEXT_BYTES) throw new RangeError(`Context source exceeds 32 KiB: ${canonicalPath}`);
    const buffer = Buffer.alloc(MAX_CONTEXT_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_CONTEXT_BYTES) throw new RangeError(`Context source exceeds 32 KiB: ${canonicalPath}`);
    const content = buffer.subarray(0, bytesRead);
    return { path: canonicalPath, content: content.toString('utf8'), sha256: createHash('sha256').update(content).digest('hex') };
  } finally {
    await file.close();
  }
}

function boundedText(value, label) {
  if (typeof value !== 'string') return '';
  const limit = 4096;
  if (Buffer.byteLength(value) > limit) throw new RangeError(`${label} exceeds the context limit`);
  return value;
}

export async function assembleContext({ repoRoot, task, workflow, dependencyResults = [], memoryPaths = [] }) {
  if (typeof repoRoot !== 'string' || !task || !workflow || !Array.isArray(dependencyResults) || !Array.isArray(memoryPaths)) throw new TypeError('Invalid context inputs');
  const root = await realpath(repoRoot);
  const requested = [...(task.readScope ?? []), ...memoryPaths];
  const paths = [];
  for (const scope of requested) {
    const safe = safeRelative(scope);
    const absolute = resolve(root, safe);
    assertInside(root, absolute);
    await inspectPath(root, safe, paths);
  }
  const uniquePaths = [...new Set(paths)].sort();
  const sources = [];
  for (const path of uniquePaths) sources.push(await readVerified(root, path));
  if (dependencyResults.length > 100) throw new RangeError('Context contains too many dependency results');
  const dependencies = dependencyResults.map((result) => {
    if (!result || typeof result !== 'object' || typeof result.taskId !== 'string') throw new TypeError('Invalid dependency result');
    return { taskId: result.taskId, summary: boundedText(result.summary ?? '', 'Dependency summary'), headSha: boundedText(result.headSha ?? '', 'Dependency revision') };
  });
  const text = [
    `Goal: ${boundedText(workflow.goal ?? '', 'Goal')}`,
    `Workflow: ${boundedText(workflow.id ?? '', 'Workflow ID')} @ ${boundedText(workflow.repository?.baseSha ?? '', 'Base revision')}`,
    `Task: ${boundedText(task.id ?? '', 'Task ID')} — ${boundedText(task.title ?? '', 'Task title')}`,
    `Details: ${boundedText(task.details ?? '', 'Task details')}`,
    `Acceptance: ${(task.acceptance ?? []).map((item) => boundedText(item, 'Acceptance criterion')).join('; ')}`,
    `Decisions: ${(workflow.decisions ?? []).map((item) => `${item.id}: ${boundedText(item.text, 'Decision')}`).join('\n') || '(none)'}`,
    `Dependencies: ${dependencies.map((item) => `${item.taskId}@${item.headSha}: ${item.summary}`).join('\n') || '(none)'}`,
    ...sources.map((source) => `Source: ${source.path}#sha256=${source.sha256}\n${source.content}`),
  ].join('\n\n');
  if (Buffer.byteLength(text) > MAX_CONTEXT_BYTES) throw new RangeError('Assembled context exceeds 32 KiB');
  return { text, sources: sources.map(({ path, sha256 }) => ({ path, sha256 })), dependencies };
}

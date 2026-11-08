import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createReviewer, parseReview } from '../runtime/review.mjs';

const changedLine = `diff --git a/src/file.js b/src/file.js
--- a/src/file.js
+++ b/src/file.js
@@ -1 +1 @@
-old code
+new code
`;

function finding(path, line) {
  return { severity: 'high', path, line, condition: 'Input is missing', impact: 'Request crashes',
    evidence: 'The changed parser reads the value directly', fix: 'Validate the input' };
}

test('review protocol rejects ungrounded findings and contradictory success', () => {
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [] })));
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [{ path: 'src/file.js' }] })));
  assert.deepEqual(parseReview('{"verdict":"pass","findings":[]}'), { verdict: 'pass', findings: [] });
});

test('review findings must point to changed lines and deduplicate exact evidence locations', () => {
  const issue = finding('src/file.js', 1);
  const parsed = parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [issue, issue,
    { ...issue, condition: 'Input is zero' }] }), changedLine);
  assert.equal(parsed.findings.length, 2);
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'pass', findings: [issue] }), changedLine));
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [finding('src/other.js', 1)] }), changedLine));
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [finding('src/file.js', 8)] }), changedLine));
  assert.throws(() => parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [finding('../escape.js', 1)] }), changedLine));
});

test('review locations support added files and deleted lines', () => {
  const newFile = `diff --git a/new.js b/new.js
new file mode 100644
--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+first
+second
`;
  const deletedFile = `diff --git a/old.js b/old.js
deleted file mode 100644
--- a/old.js
+++ /dev/null
@@ -1,2 +0,0 @@
-first
-second
`;
  assert.equal(parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [finding('new.js', 2)] }), newFile).findings.length, 1);
  assert.equal(parseReview(JSON.stringify({ verdict: 'needs_fix', findings: [finding('old.js', 2)] }), deletedFile).findings.length, 1);
});

test('read-only reviewer detects tracked content changes hidden by unchanged porcelain status', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-review-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-b', 'review-fixture');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(root, 'source.js'), 'const value = 1;\n');
  writeFileSync(join(root, 'dirty.txt'), 'base\n');
  git('add', '.');
  git('commit', '-m', 'test: create review fixture');
  const baseSha = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'source.js'), 'const value = 2;\n');
  git('add', 'source.js');
  git('commit', '-m', 'test: change reviewed source');
  const headSha = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'dirty.txt'), 'existing dirty value\n');
  const beforeStatus = git('status', '--porcelain=v1');
  const reviewer = createReviewer({ adapter: async () => {
    writeFileSync(join(root, 'dirty.txt'), 'changed during review\n');
    return { status: 'completed', summary: '{"verdict":"pass","findings":[]}', model: 'fixture' };
  } });
  await assert.rejects(reviewer({ cwd: root, baseSha, headSha, model: { model: 'fixture', adapter: 'codex' },
    task: { id: 'review', title: 'Review', acceptance: ['No issues'] } }), /changed the candidate/);
  assert.equal(git('status', '--porcelain=v1'), beforeStatus);
});

test('reviewer sends every changed file in a separate bounded adapter call', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-review-chunks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-b', 'review-fixture');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(root, 'first.js'), 'const first = 1;\n');
  writeFileSync(join(root, 'second.js'), 'const second = 1;\n');
  git('add', '.');
  git('commit', '-m', 'test: create chunk fixture');
  const baseSha = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'first.js'), 'const first = 2;\n');
  writeFileSync(join(root, 'second.js'), 'const second = 2;\n');
  git('add', '.');
  git('commit', '-m', 'test: change two reviewed files');
  const headSha = git('rev-parse', 'HEAD');
  const contexts = [];
  const reviewer = createReviewer({ adapter: async ({ context }) => {
    contexts.push(context);
    return { status: 'completed', summary: '{"verdict":"pass","findings":[]}', artifacts: [], model: 'fixture' };
  } });
  const result = await reviewer({ cwd: root, baseSha, headSha, model: { model: 'fixture', adapter: 'codex' },
    task: { id: 'review', title: 'Review', acceptance: ['No issues'] } });
  assert.equal(result.verdict, 'pass');
  assert.equal(contexts.length, 2);
  assert.match(contexts[0], /first\.js/);
  assert.match(contexts[1], /second\.js/);
  assert.ok(contexts.every((context) => Buffer.byteLength(context) < 30_000));
});

test('reviewer blocks an oversized single hunk before calling the adapter', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-review-hunk-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-b', 'review-fixture');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(root, 'large.js'), 'old\n');
  git('add', '.');
  git('commit', '-m', 'test: create large hunk fixture');
  const baseSha = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'large.js'), `${'x'.repeat(25_000)}\n`);
  git('add', '.');
  git('commit', '-m', 'test: create oversized hunk');
  let calls = 0;
  const reviewer = createReviewer({ adapter: async () => { calls += 1; } });
  const result = await reviewer({ cwd: root, baseSha, headSha: git('rev-parse', 'HEAD'), model: { model: 'fixture', adapter: 'codex' },
    task: { id: 'review', title: 'Review', acceptance: [] } });
  assert.equal(result.verdict, 'blocked');
  assert.equal(calls, 0);
});

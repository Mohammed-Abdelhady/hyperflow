import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { artifactPath, readJson, writeJson } from '../runtime/files.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('artifact writes stay within the owned directory and cannot follow a malicious state symlink', (t) => {
  const root = fixture(t);
  const external = fixture(t);
  symlinkSync(external, join(root, '.hyperflow'), 'dir');
  assert.throws(() => artifactPath(root, 'runtime.sqlite'));
  assert.equal(existsSync(join(external, 'runtime.sqlite')), false);
});

test('JSON round trip is atomic and private source symlinks are rejected', (t) => {
  const root = fixture(t);
  const path = artifactPath(root, 'workflows', 'test', 'approval.json');
  writeJson(path, { digest: 'fixture' });
  assert.deepEqual(readJson(path), { digest: 'fixture' });
  const link = join(root, 'linked.json');
  symlinkSync(path, link);
  assert.throws(() => readJson(link));
  assert.throws(() => artifactPath(root, '..', 'escape.json'));
});

test('JSON reads reject symlinked parents into protected files before parsing', (t) => {
  const root = fixture(t);
  const protectedDirectory = join(root, 'synthetic-secrets', '.env');
  mkdirSync(protectedDirectory, { recursive: true });
  writeFileSync(join(protectedDirectory, 'credentials.json'), '{"token":"fixture-only"}');
  symlinkSync(protectedDirectory, join(root, 'input'), 'dir');
  assert.throws(() => readJson(join(root, 'input', 'credentials.json')), /Protected|symlink/i);
});

test('JSON reads reject hardlinks and inputs larger than the file bound', (t) => {
  const root = fixture(t);
  const source = join(root, 'source.json');
  const hardlink = join(root, 'hardlink.json');
  writeFileSync(source, '{"value":1}');
  linkSync(source, hardlink);
  assert.throws(() => readJson(hardlink), /bounded private/);
  const oversized = join(root, 'oversized.json');
  writeFileSync(oversized, `{"value":"${'x'.repeat(1_048_576)}"}`);
  assert.throws(() => readJson(oversized), /bounded private/);
});

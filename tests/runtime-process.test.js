import assert from 'node:assert/strict';
import { delimiter, dirname } from 'node:path';
import { test } from 'node:test';
import { childEnvironment, runProcess } from '../runtime/process.mjs';

test('child path preserves configured executable precedence and includes runtime siblings', () => {
  const before = process.env.PATH;
  try {
    process.env.PATH = ['/explicit/bin', '/usr/bin'].join(delimiter);
    const result = childEnvironment();
    assert.equal(result.PATH.split(delimiter)[0], '/explicit/bin');
    assert.ok(result.PATH.split(delimiter).includes(dirname(process.execPath)));
    assert.equal(process.env.PATH, ['/explicit/bin', '/usr/bin'].join(delimiter));
  } finally { process.env.PATH = before; }
});

test('argv is passed literally without expanding shell text', async () => {
  const literal = '$(touch forbidden); `echo injected`';
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, literal);
});

test('an already cancelled request starts no process', async () => {
  const signal = AbortSignal.abort(new Error('fixture cancellation'));
  await assert.rejects(async () => runProcess(process.execPath, ['-e', 'process.exit(0)'], { signal }), /fixture cancellation/);
});

test('a missing executable stays distinct from a failed execution', async () => {
  await assert.rejects(runProcess('/no-such-hyperflow-command', []), { code: 'ENOENT' });
  const result = await runProcess(process.execPath, ['-e', 'process.exit(7)']);
  assert.equal(result.code, 7);
});

test('delegate instructions cross stdin without shell or argument interpolation', async () => {
  const input = 'Scoped instructions with $variables, `commands`, and Unicode \u0633\u0644\u0627\u0645.';
  const result = await runProcess(process.execPath, ['-e',
    'process.stdin.setEncoding("utf8");process.stdin.on("data",chunk=>process.stdout.write(chunk))'], { input });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, input);
});

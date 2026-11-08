import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAdapter } from '../runtime/relay.mjs';

function fixture(t, resultOverrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-relay-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const relayPath = join(root, 'relay.mjs');
  const result = { schema: 'delegate-relay.result.v1', status: 'completed', exitCode: 0,
    model: 'zai/glm-5.3-flash', agent: 'build', sessionId: 'fixture-session', finalMessage: 'finished',
    touchedFiles: [' M feature.txt'], ...resultOverrides };
  writeFileSync(relayPath, `import {writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const args=process.argv.slice(2);const value=(name)=>args[args.indexOf(name)+1];
writeFileSync(join(value('--cd'),'argv.json'),JSON.stringify(args));
writeFileSync(join(value('--out-dir'),'result.json'),JSON.stringify(${JSON.stringify(result)}));
`);
  return { root, adapter: createAdapter({ relayPath, outRoot: join(root, 'runs') }) };
}

test('relay crosses the process boundary with an explicit real model and bounded task', async (t) => {
  const f = fixture(t);
  const result = await f.adapter({ task: { id: 'T01', title: 'Edit feature', acceptance: ['Works'], writeScope: ['feature.txt'] },
    cwd: f.root, model: { model: 'zai/glm-5.3-flash', adapter: 'opencode' }, attempt: 1 });
  assert.equal(result.status, 'completed');
  assert.equal(result.sessionId, 'fixture-session');
  const argv = JSON.parse(readFileSync(join(f.root, 'argv.json'), 'utf8'));
  assert.equal(argv[argv.indexOf('--model') + 1], 'zai/glm-5.3-flash');
  assert.equal(argv[argv.indexOf('--agent') + 1], 'build');
  assert.ok(argv.includes('--timeout'));
});

test('relay rejects a different model rather than attributing the requested model', async (t) => {
  const f = fixture(t, { model: 'openai/another-model' });
  await assert.rejects(f.adapter({ task: { id: 'T01', title: 'Edit', acceptance: ['Works'] },
    cwd: f.root, model: { model: 'zai/glm-5.3-flash', adapter: 'opencode' } }), /model/i);
});

test('failed provider evidence cannot become a successful task', async (t) => {
  const f = fixture(t, { status: 'failed', exitCode: 1 });
  const result = await f.adapter({ task: { id: 'T01', title: 'Edit', acceptance: ['Works'] },
    cwd: f.root, model: { model: 'zai/glm-5.3-flash', adapter: 'opencode' } });
  assert.equal(result.status, 'failed');
});

for (const harness of ['codex', 'claude-code']) {
  test(`${harness} delegates receive a native model and the effort assigned in the plan`, async (t) => {
    const model = harness === 'codex' ? 'gpt-6.1-sol' : 'opus';
    const f = fixture(t, { model, effort: 'high', agent: undefined, threadId: 'native-thread' });
    const result = await f.adapter({ task: { id: 'T01', title: 'Bounded task', effort: 'high', acceptance: ['Works'] },
      cwd: f.root, model: { model, adapter: harness } });
    assert.equal(result.status, 'completed');
    assert.equal(result.adapter, harness);
    assert.equal(result.requestedEffort, 'high');
    assert.equal(result.appliedEffort, null);
    const argv = JSON.parse(readFileSync(join(f.root, 'argv.json'), 'utf8'));
    assert.equal(argv[argv.indexOf('--effort') + 1], 'high');
    assert.equal(argv.includes('--agent'), false);
    assert.equal(argv[argv.indexOf('--model') + 1], model);
  });
}

test('OpenCode task effort is forwarded as its supported variant and acknowledgement is checked', async (t) => {
  const f = fixture(t, { variant: 'low' });
  const turn = { task: { id: 'T01', title: 'Quick task', effort: 'low', acceptance: ['Works'] },
    cwd: f.root, model: { model: 'zai/glm-5.3-flash', adapter: 'opencode' } };
  const result = await f.adapter(turn);
  assert.equal(result.requestedEffort, 'low');
  const argv = JSON.parse(readFileSync(join(f.root, 'argv.json'), 'utf8'));
  assert.equal(argv[argv.indexOf('--variant') + 1], 'low');
  const mismatch = fixture(t, { variant: 'high' });
  await assert.rejects(mismatch.adapter({ ...turn, cwd: mismatch.root }), /model and agent/);
});

test('default relay selection uses the selected harness instead of a different installed relay', async (t) => {
  const { installedRelay } = await import('../runtime/relay.mjs');
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-relay-home-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, '.local/share/hyperflow/delegate-skills');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(directory, { recursive: true });
  for (const name of ['opencode', 'codex', 'claude']) writeFileSync(join(directory, `${name}-relay.mjs`), 'fixture');
  assert.equal(installedRelay('codex', root), join(directory, 'codex-relay.mjs'));
  assert.equal(installedRelay('claude-code', root), join(directory, 'claude-relay.mjs'));
  assert.equal(installedRelay('opencode', root), join(directory, 'opencode-relay.mjs'));
});

test('completed delegate runs remove source briefs and expire only completed owned evidence', async (t) => {
  const { pruneRelayArtifacts } = await import('../runtime/relay.mjs');
  const { existsSync, mkdirSync } = await import('node:fs');
  const f = fixture(t);
  const result = await f.adapter({ task: { id: 'T01', title: 'Edit', acceptance: ['Works'] }, cwd: f.root,
    model: { model: 'zai/glm-5.3-flash', adapter: 'opencode' }, context: 'private source context' });
  const directory = result.artifacts[0].replace(/\/result.json$/, '');
  assert.equal(existsSync(join(directory, 'brief.md')), false);
  assert.equal(existsSync(result.artifacts[0]), true);
  const active = join(f.root, 'runs/run-active');mkdirSync(active);
  writeFileSync(join(directory, 'retention.json'), JSON.stringify({completed: true, expiresAt: 5}));
  pruneRelayArtifacts(join(f.root, 'runs'), 10);
  assert.equal(existsSync(directory), false);
  assert.equal(existsSync(active), true);
});

for (const harness of ['antigravity', 'cursor', 'pi']) {
  test(`${harness} delegates preserve the chosen harness and its effort-control boundary`, async (t) => {
    const effort = harness === 'antigravity' ? 'high' : 'harness-default';
    const f = fixture(t, { model: 'fixture-model', effort: harness === 'antigravity' ? effort : undefined, agent: undefined });
    const turn = { task: { id: 'T01', title: 'Scoped task', effort, acceptance: ['Works'] }, cwd: f.root,
      model: { model: 'fixture-model', adapter: harness } };
    const result = await f.adapter(turn);
    assert.equal(result.adapter, harness);
    const args = JSON.parse(readFileSync(join(f.root, 'argv.json'), 'utf8'));
    assert.equal(args.includes('--agent'), false);
    assert.equal(args.includes('--effort'), harness === 'antigravity');
    if (harness !== 'antigravity') await assert.rejects(f.adapter({ ...turn, task: { ...turn.task, effort: 'high' } }), /does not expose/);
  });
}

for (const harness of ['codex', 'claude-code', 'antigravity', 'cursor', 'opencode', 'pi']) {
  test(`${harness} writing runs are unattended while review stays read only`, async (t) => {
    const overrides = { model: harness === 'opencode' ? 'zai/glm-5.3-flash' : 'fixture-model',
      agent: harness === 'opencode' ? 'build' : undefined };
    const f = fixture(t, overrides);
    const turn = { task: { id: 'T01', title: 'Implement', acceptance: ['Works'],
      effort: ['cursor', 'pi'].includes(harness) ? 'harness-default' : undefined },
      cwd: f.root, model: { model: overrides.model, adapter: harness } };
    await f.adapter(turn);
    const args = JSON.parse(readFileSync(join(f.root, 'argv.json'), 'utf8'));
    if (harness === 'codex') assert.equal(args[args.indexOf('--sandbox') + 1], 'danger-full-access');
    if (['claude-code', 'antigravity'].includes(harness)) assert.ok(args.includes('--dangerously-skip-permissions'));
    if (harness === 'cursor') assert.equal(args[args.indexOf('--sandbox') + 1], 'disabled');
    if (harness === 'opencode') assert.equal(args.includes('--no-auto'), false);
    const reviewFixture = fixture(t, { ...overrides, agent: harness === 'opencode' ? 'plan' : undefined });
    const reviewer = createAdapter({ relayPath: join(reviewFixture.root, 'relay.mjs'),
      outRoot: join(reviewFixture.root, 'review-runs'), readOnly: true });
    await reviewer({ ...turn, cwd: reviewFixture.root });
    const reviewArgs = JSON.parse(readFileSync(join(reviewFixture.root, 'argv.json'), 'utf8'));
    assert.ok(reviewArgs.includes('--read-only'));
    assert.equal(reviewArgs.includes('--dangerously-skip-permissions'), false);
    assert.equal(reviewArgs.includes('--sandbox'), false);
  });
}

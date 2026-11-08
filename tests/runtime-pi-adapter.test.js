import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdapter } from '../runtime/relay.mjs';

function fixture(t, overrides = {}, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-pi-native-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const command = join(root, 'pi');
  const message = { role: 'assistant', model: 'glm-5.3-flash', provider: 'zai',
    thinkingLevel: 'medium', stopReason: 'stop', content: [{ type: 'text', text: 'implemented' }], ...overrides };
  const events = [{ type: 'session', id: 'fresh-session' }, ...(options.extraEvents ?? []),
    { type: 'message_end', message }, ...(options.noTerminal ? [] : [{ type: 'agent_end', willRetry: false }])];
  writeFileSync(command, `#!${process.execPath}
import { readFileSync, writeFileSync } from 'node:fs';
writeFileSync('observed.json',JSON.stringify({args:process.argv.slice(2),brief:readFileSync(0,'utf8')}));
for(const event of ${JSON.stringify(events)}) process.stdout.write(JSON.stringify(event)+'\\n');
process.exitCode=${options.exitCode ?? 0};
`);
  chmodSync(command, 0o700);
  return { root, command, turn: { task: { id: 'T01', title: 'Implement feature', details: 'Write the scoped feature.',
    effort: 'medium', acceptance: ['Works'], writeScope: ['feature.js'] }, cwd: root,
    model: { adapter: 'pi', model: 'zai/glm-5.3-flash' } } };
}

test('Pi forwards exact planned thinking and source brief through a fresh process', async t => {
  const f = fixture(t);
  const result = await createAdapter({ piCommand: f.command, outRoot: join(f.root, 'runs') })(f.turn);
  assert.equal(result.status, 'completed');
  assert.equal(result.appliedEffort, 'medium');
  assert.equal(result.actualModel, 'glm-5.3-flash');
  const { args, brief } = JSON.parse(readFileSync(join(f.root, 'observed.json'), 'utf8'));
  assert.equal(args[args.indexOf('--thinking') + 1], 'medium');
  assert.equal(args[args.indexOf('--model') + 1], 'zai/glm-5.3-flash');
  assert.ok(args.includes('--no-session'));
  assert.ok(args.includes('--no-extensions'));
  assert.ok(args.includes('--no-skills'));
  assert.equal(args.includes('--session'), false);
  assert.equal(args[args.indexOf('--tools') + 1], 'read,bash,edit,write,grep,find,ls');
  assert.match(brief, /Write the scoped feature/);
  assert.equal(args.includes(brief), false);
});

test('Pi reviews expose only read tools and keep fresh sessions', async t => {
  const f = fixture(t);
  await createAdapter({ piCommand: f.command, outRoot: join(f.root, 'runs'), readOnly: true })(f.turn);
  const { args } = JSON.parse(readFileSync(join(f.root, 'observed.json'), 'utf8'));
  assert.equal(args[args.indexOf('--tools') + 1], 'read,grep,find,ls');
  assert.ok(args.includes('--no-mcp'));
  assert.ok(args.includes('--no-approve'));
});

for (const [label, change, error] of [
  ['different model', { model: 'glm-5.3' }, /different model/],
  ['different effort', { thinkingLevel: 'low' }, /planned effort/],
  ['provider failure', { stopReason: 'error', errorMessage: 'provider failed' }, /provider failed/],
  ['unfinished tool call', { stopReason: 'toolUse' }, /final response/],
]) {
  test(`Pi rejects ${label} instead of accepting delegate success`, async t => {
    const f = fixture(t, change);
    const adapter = createAdapter({ piCommand: f.command, outRoot: join(f.root, 'runs') });
    await assert.rejects(adapter(f.turn), error);
  });
}

for (const [label, options, error] of [
  ['missing completion event', { noTerminal: true }, /final response/],
  ['failed exit', { exitCode: 2 }, /exit 2/],
  ['disallowed read-only tool', { extraEvents: [{ type: 'tool_execution_start', toolName: 'bash' }] }, /disallowed tool/],
]) {
  test(`Pi rejects ${label}`, async t => {
    const f = fixture(t, {}, options);
    await assert.rejects(createAdapter({ piCommand: f.command, outRoot: join(f.root, 'runs'), readOnly: true })(f.turn), error);
  });
}

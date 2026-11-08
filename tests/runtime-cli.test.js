import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../runtime/cli.mjs', import.meta.url));
const MODELS = [
  { id: 'glm-primary', providerID: 'zai', variants: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }], enabled: true },
  { id: 'glm-5.3', providerID: 'zai', variants: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }], enabled: true },
  { id: 'glm-5.3-flash', providerID: 'zai', variants: [{ id: 'low' }, { id: 'medium' }, { id: 'high' }], enabled: true },
];

function fixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'hyperflow-cli-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'project'); mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-b', 'fixture');
  git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(root, 'README.md'), 'baseline\n'); git('add', '.'); git('commit', '-m', 'test: create fixture');
  const bin = join(base, 'bin'); mkdirSync(bin);
  const opencode = join(bin, 'opencode');
  writeFileSync(opencode, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({data:${JSON.stringify(MODELS)}}));\n`);
  chmodSync(opencode, 0o700);
  mkdirSync(join(root, '.hyperflow'));
  writeFileSync(join(root, '.hyperflow/agents.json'), JSON.stringify({
    primary: { adapter: 'opencode', model: 'zai/glm-primary' },
    general: { adapter: 'opencode', model: 'zai/glm-5.3' },
    lightweight: { adapter: 'opencode', model: 'zai/glm-5.3-flash' },
  }));
  writeFileSync(join(root, '.hyperflow/checks.json'), JSON.stringify({ 'feature-check': { command: process.execPath,
    args: ['-e', "if(require('node:fs').readFileSync('feature.txt','utf8')!=='verified\\n')process.exit(1)"] } }));
  const env = { ...process.env, PATH: [bin, process.env.PATH].join(delimiter), HYPERFLOW_CONFIG_PATH: join(base, 'global.json') };
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
  const task = (over = {}) => ({ id: 'T01', title: 'Write feature', details: 'Create feature.txt containing the verified result.',
    effort: 'low', dependsOn: [], readScope: ['README.md'], writeScope: ['feature.txt'],
    acceptance: ['Feature contains the verified result'], checks: ['feature-check'], ...over });
  const draft = { schemaVersion: 2, id: 'feature', goal: 'Add verified feature', repository: { root, baseSha: git('rev-parse', 'HEAD') },
    tasks: [task(),
      task({ id: 'T02', title: 'Extend feature', details: 'Extend the module with the documented option.', difficulty: 'complex',
        effort: 'high', dependsOn: ['T01'], writeScope: ['feature-extra.txt'], acceptance: ['Extended feature keeps the verified result'] }),
      task({ id: 'T03', title: 'Harden feature', details: 'Validate untrusted input before parsing it.', difficulty: 'security',
        effort: 'medium', dependsOn: ['T02'], writeScope: ['feature-hardened.txt'], acceptance: ['Untrusted input is rejected safely'] })],
    questions: [{ id: 'Q1', prompt: 'Use the agreed behavior?', blocking: true, recommendation: 'Use verified output' }], decisions: [] };
  const draftPath = join(base, 'draft.json'); writeFileSync(draftPath, JSON.stringify(draft));
  const answers = join(base, 'answers.json'); writeFileSync(answers, JSON.stringify({ confirmed: true, answers: { Q1: 'Use verified output' } }));
  const workflowDir = () => join(root, '.hyperflow/workflows/feature');
  const compile = () => {
    successful(run('plan', draftPath));
    successful(run('answer', 'feature', answers));
    return successful(run('compile', 'feature'));
  };
  return { base, root, run, draftPath, answers, draft, git, workflowDir, compile };
}

function successful(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('CLI question answers compile a schema 2 workflow routed across roles and reject later edits', (t) => {
  const f = fixture(t);
  const created = successful(f.run('plan', f.draftPath));
  assert.equal(created.status, 'awaiting_answers');
  const refused = f.run('compile', 'feature');
  assert.equal(refused.status, 1);
  assert.equal(existsSync(join(f.root, '.hyperflow/workflows/feature/workflow.mjs')), false);
  successful(f.run('answer', 'feature', f.answers));
  const compiled = successful(f.run('compile', 'feature'));
  assert.equal(compiled.status, 'ready');
  assert.equal(compiled.assignments[0].adapter, 'opencode');
  assert.equal(compiled.assignments[0].effort, 'low');
  assert.equal(compiled.assignments[0].model, 'zai/glm-5.3-flash');
  assert.equal(compiled.assignments[1].model, 'zai/glm-5.3');
  assert.equal(compiled.assignments[2].model, 'zai/glm-5.3');
  assert.equal(compiled.securityReview.role, 'general');
  assert.equal(compiled.securityReview.effort, 'high');
  assert.equal(compiled.securityFix.role, 'general');
  const source = readFileSync(compiled.workflowPath, 'utf8');
  writeFileSync(compiled.workflowPath, source.replace('Write feature', 'Write different feature'));
  const stale = f.run('smash', compiled.workflowPath);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /changed/);
});

test('compile generates phase artifacts carrying full detail and resolved assignments', (t) => {
  const f = fixture(t);
  f.compile();
  const dir = f.workflowDir();
  for (const path of ['planning.md', 'security-review.md', 'security-fix.md', 'tasks/T01/task.md', 'tasks/T01/implementation.md',
    'tasks/T01/correctness-review.md', 'tasks/T02/implementation.md', 'tasks/T03/correctness-review.md']) {
    assert.equal(existsSync(join(dir, path)), true, path);
  }
  const planning = readFileSync(join(dir, 'planning.md'), 'utf8');
  assert.match(planning, /zai\/glm-5\.3-flash/);
  for (const task of f.draft.tasks) {
    assert.ok(planning.includes(`tasks/${task.id}/task.md`));
    assert.ok(readFileSync(join(dir, `tasks/${task.id}/task.md`), 'utf8').includes(task.details));
  }
  assert.match(planning, /not executable authority/);
  const implementation = readFileSync(join(dir, 'tasks/T02/implementation.md'), 'utf8');
  assert.match(implementation, /Extend the module with the documented option\./);
  assert.match(implementation, /general/);
  assert.match(implementation, /zai\/glm-5\.3/);
  assert.match(implementation, /effort high/);
  assert.match(implementation, /feature-extra\.txt/);
  const review = readFileSync(join(dir, 'tasks/T01/correctness-review.md'), 'utf8');
  assert.match(review, /primary/);
  assert.match(review, /read-only/i);
  assert.match(review, /Feature contains the verified result/);
  const securityReview = readFileSync(join(dir, 'security-review.md'), 'utf8');
  assert.match(securityReview, /general/);
  assert.match(securityReview, /once/i);
  assert.match(securityReview, /after all/i);
  const securityFix = readFileSync(join(dir, 'security-fix.md'), 'utf8');
  assert.match(securityFix, /general/);
  assert.match(securityFix, /revalidat/i);
  assert.match(securityFix, /checks/);
});

test('approval blocks execution when phase artifacts are missing, edited, or symlinked', (t) => {
  const f = fixture(t);
  const compiled = f.compile();
  rmSync(join(f.workflowDir(), 'planning.md'));
  const missing = f.run('smash', compiled.workflowPath);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /artifact/i);

  const g = fixture(t);
  const gCompiled = g.compile();
  const victim = join(g.workflowDir(), 'tasks/T01/implementation.md');
  writeFileSync(victim, `${readFileSync(victim, 'utf8')}\ntampered\n`);
  const tampered = g.run('smash', gCompiled.workflowPath);
  assert.equal(tampered.status, 1);
  assert.match(tampered.stderr, /artifact/i);

  const h = fixture(t);
  const hCompiled = h.compile();
  const outside = join(h.base, 'outside.md');
  writeFileSync(outside, 'attack\n');
  const linked = join(h.workflowDir(), 'security-review.md');
  unlinkSync(linked);
  symlinkSync(outside, linked);
  const refused = h.run('smash', hCompiled.workflowPath);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /artifact/i);
});

test('schema 1 workflows refuse execution until replanned on schema 2', (t) => {
  const f = fixture(t);
  const legacy = { schemaVersion: 1, id: 'legacy', goal: 'old plan', repository: { root: f.root, baseSha: f.git('rev-parse', 'HEAD') },
    tasks: [{ id: 'T01', title: 'Build', agentRole: 'general', effort: 'low', dependsOn: [], readScope: ['README.md'],
      writeScope: ['feature.txt'], acceptance: ['works'], checks: ['feature-check'] }], questions: [], decisions: [] };
  const legacyPath = join(f.base, 'legacy.workflow.mjs');
  writeFileSync(legacyPath, `export default ${JSON.stringify(legacy)};\n`);
  const refused = f.run('smash', legacyPath);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /schema 2|re-plan/i);
});

test('invalid schema 2 drafts cannot plan', (t) => {
  const f = fixture(t);
  const blank = JSON.parse(readFileSync(f.draftPath, 'utf8'));
  blank.tasks[0].details = '   ';
  const blankPath = join(f.base, 'blank.json');
  writeFileSync(blankPath, JSON.stringify(blank));
  assert.equal(f.run('plan', blankPath).status, 1);
  const invalid = JSON.parse(readFileSync(f.draftPath, 'utf8'));
  invalid.tasks[0].effort = 'deep';
  const invalidPath = join(f.base, 'invalid.json');
  writeFileSync(invalidPath, JSON.stringify(invalid));
  assert.equal(f.run('plan', invalidPath).status, 1);
});

test('the task index keeps pending, ready, and compiled statuses accurate', (t) => {
  const f = fixture(t);
  successful(f.run('plan', f.draftPath));
  const index = join(f.root, '.hyperflow/tasks/feature.md');
  const pending = readFileSync(index, 'utf8');
  assert.match(pending, /awaiting answers/);
  assert.match(pending, /Create feature\.txt containing the verified result\./);
  successful(f.run('answer', 'feature', f.answers));
  assert.match(readFileSync(index, 'utf8'), /ready to compile/);
  successful(f.run('compile', 'feature'));
  const compiled = readFileSync(index, 'utf8');
  assert.match(compiled, /compiled/);
  assert.match(compiled, /tasks\/T01\/task\.md/);
});

test('configuration does not change the current host and supports a named delegate profile', (t) => {
  const f=fixture(t);
  const result=successful(f.run('agents-config','set','reviewer','opencode','zai/glm-5.3'));
  assert.equal(result.roles.reviewer.adapter,'opencode');
  assert.equal(result.roles.reviewer.model,'zai/glm-5.3');
});

test('changing a compiled model binding blocks dispatch before runtime state is created', (t) => {
  const f = fixture(t);
  const compiled = f.compile();
  const configPath = join(f.root, '.hyperflow/agents.json');
  const profiles = JSON.parse(readFileSync(configPath, 'utf8'));
  profiles.lightweight.model = 'zai/glm-5.3';
  writeFileSync(configPath, JSON.stringify(profiles));
  const result = f.run('smash', compiled.workflowPath);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /role bindings changed/i);
  assert.equal(existsSync(join(f.root, '.hyperflow/runtime.sqlite')), false);
});

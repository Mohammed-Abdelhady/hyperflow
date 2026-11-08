import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../runtime/cli.mjs', import.meta.url));
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
  writeFileSync(opencode, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({data:[{id:'glm-5.3',providerID:'zai',variants:[{id:'low'},{id:'high'}],enabled:true}]}));\n`);
  chmodSync(opencode, 0o700);
  mkdirSync(join(root, '.hyperflow'));
  writeFileSync(join(root, '.hyperflow/agents.json'), JSON.stringify({general:{adapter:'opencode',model:'zai/glm-5.3'}}));
  writeFileSync(join(root, '.hyperflow/checks.json'), JSON.stringify({ 'feature-check': {command: process.execPath,
    args: ['-e', "if(require('node:fs').readFileSync('feature.txt','utf8')!=='verified\\n')process.exit(1)"]}}));
  const env = { ...process.env, PATH: [bin, process.env.PATH].join(delimiter), HYPERFLOW_CONFIG_PATH: join(base, 'global.json') };
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', timeout: 20_000 });
  const draft = { schemaVersion: 1, id: 'feature', goal: 'Add verified feature', repository: {root, baseSha: git('rev-parse', 'HEAD')},
    tasks: [{id:'T01',title:'Write feature',agentRole:'general',effort:'low',dependsOn:[],readScope:['README.md'],
      writeScope:['feature.txt'],acceptance:['Feature contains the verified result'],checks:['feature-check']}],
    questions:[{id:'Q1',prompt:'Use the agreed behavior?',blocking:true,recommendation:'Use verified output'}],decisions:[] };
  const draftPath = join(base, 'draft.json'); writeFileSync(draftPath, JSON.stringify(draft));
  const answers = join(base, 'answers.json');writeFileSync(answers,JSON.stringify({confirmed:true,answers:{Q1:'Use verified output'}}));
  return {base,root,run,draftPath,answers};
}

function successful(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('CLI question answers compile into a workflow whose receipt rejects subsequent edits', (t) => {
  const f=fixture(t);
  const created=successful(f.run('plan',f.draftPath));
  assert.equal(created.status,'awaiting_answers');
  const refused=f.run('compile','feature');
  assert.equal(refused.status,1);
  assert.equal(existsSync(join(f.root,'.hyperflow/workflows/feature/workflow.mjs')),false);
  successful(f.run('answer','feature',f.answers));
  const compiled=successful(f.run('compile','feature'));
  assert.equal(compiled.status,'ready');
  assert.equal(compiled.assignments[0].adapter,'opencode');
  assert.equal(compiled.assignments[0].effort,'low');
  const source=readFileSync(compiled.workflowPath,'utf8');
  writeFileSync(compiled.workflowPath,source.replace('Write feature','Write different feature'));
  const stale=f.run('smash',compiled.workflowPath);
  assert.equal(stale.status,1);
  assert.match(stale.stderr,/changed/);
});

test('configuration does not change the current host and supports a named delegate profile', (t) => {
  const f=fixture(t);
  const result=successful(f.run('agents-config','set','reviewer','opencode','zai/glm-5.3'));
  assert.equal(result.roles.reviewer.adapter,'opencode');
  assert.equal(result.roles.reviewer.model,'zai/glm-5.3');
});

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const SKILLS = ['hyperflow-plan', 'hyperflow-smash', 'hyperflow-crash', 'hyperflow-agents-skill'];
const LEGACY_SKILLS = ['hyperflow', 'plan', 'dispatch', 'trace', 'audit', 'deploy', 'handoff'];

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'hyperflow-hosts-'));
  const checkout = join(temp, 'checkout');
  const home = join(temp, 'home');
  const roots = [
    join(home, '.config/opencode'), join(home, '.claude'), join(home, '.codex'),
    join(home, '.gemini/config'), join(home, '.cursor'), join(home, '.pi/agent'),
  ];
  mkdirSync(join(checkout, 'runtime'), { recursive: true });
  mkdirSync(join(checkout, 'skills'), { recursive: true });
  mkdirSync(join(checkout, 'commands'), { recursive: true });
  writeFileSync(join(checkout, 'runtime/cli.mjs'), 'process.exitCode = 0;\n');
  writeFileSync(join(checkout, 'package.json'), '{"name":"hyperflow","version":"6.10.0"}\n');
  for (const skill of SKILLS) {
    mkdirSync(join(checkout, 'skills', skill));
    writeFileSync(join(checkout, 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\n`);
    writeFileSync(join(checkout, 'commands', `${skill}.md`), `<!-- hyperflow-owned-command v1 root=@HYPERFLOW_PLUGIN_ROOT@ -->\n@HYPERFLOW_PLUGIN_ROOT@/runtime/cli.mjs\n`);
  }
  execFileSync('git', ['init', '-q', checkout]);
  execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', 'https://github.com/Mohammed-Abdelhady/hyperflow.git']);
  return { temp, checkout, home, roots };
}

function install(checkout, home, args = []) {
  return spawnSync('bash', [join(ROOT, 'install.sh'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, HYPERFLOW_HOME: checkout, OPENCODE_CONFIG_DIR: join(home, '.config/opencode'), PATH: '/usr/bin:/bin' },
  });
}

test('source install links skills to all six documented global roots and commands only to OpenCode', () => {
  const { temp, checkout, home, roots } = fixture();
  try {
    for (const root of roots) mkdirSync(root, { recursive: true });
    const foreign = join(roots[4], 'skills', 'foreign-skill');
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, 'SKILL.md'), 'keep\n');

    const result = install(checkout, home, ['--link-only']);

    assert.equal(result.status, 0, result.stderr);
    for (const root of roots) {
      for (const skill of SKILLS) assert.equal(readlinkSync(join(root, 'skills', skill)), join(checkout, 'skills', skill));
    }
    for (const skill of SKILLS) assert.equal(existsSync(join(roots[0], 'commands', `${skill}.md`)), true);
    for (const root of roots.slice(1)) assert.equal(existsSync(join(root, 'commands')), false);
    assert.equal(existsSync(join(foreign, 'SKILL.md')), true);
    const removed = install(checkout, home, ['--uninstall']);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(foreign, 'SKILL.md')), true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function updateFixture({ incomplete = false, dirty = false } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'hyperflow-upgrade-'));
  const home = join(temp, 'home');
  const oldCheckout = join(temp, 'checkout');
  const newTree = join(temp, 'new-tree');
  const remote = join(temp, 'remote.git');
  mkdirSync(home);
  mkdirSync(oldCheckout);
  execFileSync('git', ['init', '--bare', '--initial-branch=main', remote]);
  execFileSync('git', ['init', '--initial-branch=main', oldCheckout]);
  git(oldCheckout, ['config', 'user.email', 'fixture@example.test']);
  git(oldCheckout, ['config', 'user.name', 'Installer Fixture']);
  writeFileSync(join(oldCheckout, 'package.json'), '{"name":"hyperflow","version":"6.10.0"}\n');
  writeFileSync(join(oldCheckout, 'README.md'), 'legacy package\n');
  writeFileSync(join(oldCheckout, 'install.sh'), '#!/usr/bin/env bash\n');
  for (const skill of LEGACY_SKILLS) {
    mkdirSync(join(oldCheckout, 'skills', skill), { recursive: true });
    writeFileSync(join(oldCheckout, 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\n`);
  }
  git(oldCheckout, ['add', '-A']);
  git(oldCheckout, ['commit', '-qm', 'legacy v6 checkout']);
  git(oldCheckout, ['remote', 'add', 'origin', 'https://github.com/Mohammed-Abdelhady/hyperflow.git']);
  git(oldCheckout, ['config', `url.${remote}.insteadOf`, 'https://github.com/Mohammed-Abdelhady/hyperflow.git']);
  git(oldCheckout, ['push', remote, 'main']);
  execFileSync('git', ['clone', '-q', oldCheckout, newTree]);
  git(newTree, ['config', 'user.email', 'fixture@example.test']);
  git(newTree, ['config', 'user.name', 'Installer Fixture']);

  rmSync(join(newTree, 'skills'), { recursive: true, force: true });
  writeFileSync(join(newTree, 'package.json'), '{"name":"hyperflow","version":"7.0.0"}\n');
  mkdirSync(join(newTree, 'runtime'), { recursive: true });
  mkdirSync(join(newTree, 'commands'), { recursive: true });
  writeFileSync(join(newTree, 'runtime/cli.mjs'), 'process.exitCode = 0;\n');
  for (const skill of SKILLS) {
    mkdirSync(join(newTree, 'skills', skill), { recursive: true });
    writeFileSync(join(newTree, 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\n`);
    writeFileSync(join(newTree, 'commands', `${skill}.md`), `<!-- hyperflow-owned-command v1 root=@HYPERFLOW_PLUGIN_ROOT@ -->\n@HYPERFLOW_PLUGIN_ROOT@/runtime/cli.mjs\n`);
  }
  if (incomplete) unlinkSync(join(newTree, 'skills/hyperflow-crash/SKILL.md'));
  git(newTree, ['add', '-A']);
  git(newTree, ['commit', '-qm', 'new runtime layout']);
  git(newTree, ['push', remote, 'main']);
  if (dirty) writeFileSync(join(oldCheckout, 'local-note.txt'), 'preserve me\n');
  mkdirSync(join(home, '.config/opencode'), { recursive: true });
  const projectData = join(home, 'project/.hyperflow/workflows/saved/plan.md');
  mkdirSync(join(projectData, '..'), { recursive: true });
  writeFileSync(projectData, 'approved project data\n');
  return { temp, home, oldCheckout, projectData };
}

test('clean known legacy checkout reaches fetch and fast-forwards only a strict new layout', () => {
  const { temp, home, oldCheckout, projectData } = updateFixture();
  try {
    const result = install(oldCheckout, home);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(oldCheckout, 'package.json'), 'utf8')).version, '7.0.0');
    assert.equal(existsSync(join(oldCheckout, 'runtime/cli.mjs')), true);
    assert.equal(existsSync(join(oldCheckout, 'skills/hyperflow')), false);
    assert.equal(readFileSync(projectData, 'utf8'), 'approved project data\n');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('dirty legacy checkout and incomplete fetched layout stay unchanged', () => {
  for (const options of [{ dirty: true }, { incomplete: true }]) {
    const { temp, home, oldCheckout, projectData } = updateFixture(options);
    try {
      const head = git(oldCheckout, ['rev-parse', 'HEAD']);
      const result = install(oldCheckout, home);
      assert.notEqual(result.status, 0);
      assert.equal(git(oldCheckout, ['rev-parse', 'HEAD']), head);
      assert.equal(JSON.parse(readFileSync(join(oldCheckout, 'package.json'), 'utf8')).version, '6.10.0');
      assert.equal(existsSync(join(oldCheckout, 'runtime/cli.mjs')), false);
      assert.equal(readFileSync(projectData, 'utf8'), 'approved project data\n');
      if (options.dirty) assert.equal(readFileSync(join(oldCheckout, 'local-note.txt'), 'utf8'), 'preserve me\n');
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }
});

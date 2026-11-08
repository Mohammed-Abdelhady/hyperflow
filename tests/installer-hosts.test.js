import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
    writeFileSync(join(checkout, 'skills', skill, 'SKILL.md'), `---\nname: ${skill}\n---\nUse node <plugin-root>/runtime/cli.mjs.\n`);
    mkdirSync(join(checkout, 'skills', skill, 'references'));
    writeFileSync(join(checkout, 'skills', skill, 'references/detail.md'), `Reference for ${skill}.\n`);
    writeFileSync(join(checkout, 'commands', `${skill}.md`), `<!-- hyperflow-owned-command v1 root=@HYPERFLOW_PLUGIN_ROOT@ -->\n@HYPERFLOW_PLUGIN_ROOT@/runtime/cli.mjs\n`);
  }
  execFileSync('git', ['init', '-q', checkout]);
  execFileSync('git', ['-C', checkout, 'remote', 'add', 'origin', 'https://github.com/Mohammed-Abdelhady/hyperflow.git']);
  return { temp, checkout, home, roots };
}

function install(checkout, home, args = []) {
  return spawnSync('bash', [join(ROOT, 'install.sh'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, HYPERFLOW_HOME: checkout, OPENCODE_CONFIG_DIR: join(home, '.config/opencode'), PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(':') },
  });
}

test('source install links five documented roots, copies Codex skills, and adds commands only to OpenCode', () => {
  const { temp, checkout, home, roots } = fixture();
  try {
    for (const root of roots) mkdirSync(root, { recursive: true });
    const foreign = join(roots[4], 'skills', 'foreign-skill');
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, 'SKILL.md'), 'keep\n');

    const result = install(checkout, home, ['--link-only']);

    assert.equal(result.status, 0, result.stderr);
    const codexSkills = join(home, '.codex/skills');
    for (const root of roots) {
      if (join(root, 'skills') === codexSkills) continue;
      for (const skill of SKILLS) assert.equal(readlinkSync(join(root, 'skills', skill)), join(checkout, 'skills', skill));
    }
    for (const skill of SKILLS) {
      const copy = join(codexSkills, skill);
      assert.equal(lstatSync(copy).isDirectory(), true);
      assert.equal(lstatSync(copy).isSymbolicLink(), false);
      assert.equal(readFileSync(join(copy, 'references/detail.md'), 'utf8'), `Reference for ${skill}.\n`);
      const contents = readFileSync(join(copy, 'SKILL.md'), 'utf8');
      assert.ok(contents.includes(`'${realpathSync(checkout)}'/runtime/cli.mjs`), contents);
      assert.equal(contents.includes('<plugin-root>'), false);
      assert.ok(existsSync(join(copy, '.hyperflow-source.json')));
    }
    for (const skill of SKILLS) assert.equal(existsSync(join(roots[0], 'commands', `${skill}.md`)), true);
    for (const root of roots.slice(1)) assert.equal(existsSync(join(root, 'commands')), false);
    assert.equal(existsSync(join(foreign, 'SKILL.md')), true);
    const removed = install(checkout, home, ['--uninstall']);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(foreign, 'SKILL.md')), true);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('Codex refreshes unchanged owned copies and preserves edits and foreign skill paths', () => {
  const { temp, checkout, home } = fixture();
  try {
    mkdirSync(join(home, '.codex'), { recursive: true });
    const codexSkills = join(home, '.codex/skills');
    const foreign = join(codexSkills, 'foreign-skill');
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, 'SKILL.md'), 'keep this skill\n');
    const installed = install(checkout, home, ['--link-only']);
    assert.equal(installed.status, 0, installed.stderr);

    writeFileSync(join(checkout, 'skills/hyperflow-plan/references/detail.md'), 'updated upstream reference\n');
    const refreshed = install(checkout, home, ['--link-only']);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.equal(readFileSync(join(codexSkills, 'hyperflow-plan/references/detail.md'), 'utf8'), 'updated upstream reference\n');

    const modified = join(codexSkills, 'hyperflow-plan/references/detail.md');
    writeFileSync(modified, 'user change\n');
    const rejected = install(checkout, home, ['--link-only']);
    assert.notEqual(rejected.status, 0);
    assert.equal(readFileSync(modified, 'utf8'), 'user change\n');
    const status = install(checkout, home, ['--status', '--json']);
    assert.equal(JSON.parse(status.stdout).skill_links.codex.state, 'conflict');

    const removed = install(checkout, home, ['--uninstall']);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(readFileSync(modified, 'utf8'), 'user change\n');
    assert.equal(readFileSync(join(foreign, 'SKILL.md'), 'utf8'), 'keep this skill\n');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('Codex migrates only current-checkout skill links and preserves other checkout links', () => {
  const { temp, checkout, home } = fixture();
  try {
    const codexSkills = join(home, '.codex/skills');
    mkdirSync(codexSkills, { recursive: true });
    for (const skill of SKILLS) symlinkSync(join(checkout, 'skills', skill), join(codexSkills, skill));
    const foreignCheckout = join(temp, 'foreign-checkout');
    mkdirSync(join(foreignCheckout, 'skills/hyperflow-smash'), { recursive: true });
    symlinkSync(join(foreignCheckout, 'skills/hyperflow-smash'), join(codexSkills, 'foreign-link'));

    const result = install(checkout, home, ['--link-only']);

    assert.equal(result.status, 0, result.stderr);
    for (const skill of SKILLS) assert.equal(lstatSync(join(codexSkills, skill)).isSymbolicLink(), false);
    assert.equal(readlinkSync(join(codexSkills, 'foreign-link')), join(foreignCheckout, 'skills/hyperflow-smash'));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('Codex status marks protected or linked files in a copy as foreign', () => {
  const { temp, checkout, home } = fixture();
  try {
    mkdirSync(join(home, '.codex'), { recursive: true });
    const codexSkills = join(home, '.codex/skills');
    const installed = install(checkout, home, ['--link-only']);
    assert.equal(installed.status, 0, installed.stderr);
    symlinkSync(join(temp, 'private.key'), join(codexSkills, 'hyperflow-plan/references/.env'));

    const status = install(checkout, home, ['--status', '--json']);

    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).skill_links.codex.state, 'conflict');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('status check rejects detected hosts with incomplete registrations', () => {
  const { temp, checkout, home } = fixture();
  try {
    execFileSync('git', ['-C', checkout, 'config', 'user.name', 'Installer Fixture']);
    execFileSync('git', ['-C', checkout, 'config', 'user.email', 'fixture@example.test']);
    execFileSync('git', ['-C', checkout, 'branch', '-M', 'main']);
    execFileSync('git', ['-C', checkout, 'add', '-A']);
    execFileSync('git', ['-C', checkout, 'commit', '-qm', 'valid checkout']);
    execFileSync('git', ['-C', checkout, 'update-ref', 'refs/remotes/origin/main', 'HEAD']);
    mkdirSync(join(home, '.codex'), { recursive: true });

    const result = install(checkout, home, ['--status', '--check', '--json']);
    const status = JSON.parse(result.stdout);

    assert.equal(result.status, 1);
    assert.equal(status.update_readiness, 'ready (branch=main)');
    assert.equal(status.skill_links.codex.state, 'none');
    assert.equal(status.healthy, false);
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

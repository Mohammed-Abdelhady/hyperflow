import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { snapshotCurrentDiff } from '../runtime/review-snapshot.mjs';

test('current-diff review snapshots staged, unstaged and untracked content without changing user index or HEAD', (t) => {
  const root=mkdtempSync(join(tmpdir(),'hyperflow-snapshot-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  git('init','-b','fixture');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
  writeFileSync(join(root,'feature.txt'),'baseline\n');git('add','.');git('commit','-m','test: baseline');
  const head=git('rev-parse','HEAD');
  writeFileSync(join(root,'feature.txt'),'staged\n');git('add','feature.txt');
  const index=git('write-tree');
  writeFileSync(join(root,'feature.txt'),'unstaged\n');writeFileSync(join(root,'new.txt'),'new\n');
  const snapshot=snapshotCurrentDiff(root);
  assert.equal(git('show',`${snapshot.headSha}:feature.txt`),'unstaged');
  assert.equal(git('show',`${snapshot.headSha}:new.txt`),'new');
  assert.equal(git('rev-parse','HEAD'),head);
  assert.equal(git('write-tree'),index);
  assert.equal(readFileSync(join(root,'feature.txt'),'utf8'),'unstaged\n');
  assert.equal(snapshotCurrentDiff(root).sourceTree,snapshot.sourceTree);
  writeFileSync(join(root,'new.txt'),'changed\n');
  assert.notEqual(snapshotCurrentDiff(root).sourceTree,snapshot.sourceTree);
});

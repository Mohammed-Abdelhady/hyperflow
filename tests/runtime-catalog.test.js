import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { discoverOpenCodeModels } from '../runtime/catalog.mjs';

test('OpenCode catalog preserves actual effort variants and excludes tokens its relay cannot launch', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hyperflow-catalog-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const command = join(root, 'catalog');
  writeFileSync(command, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({data:[
    {providerID:'zai',id:'glm-5.3-flash',enabled:true,variants:[{id:'low'},{id:'high'}]},
    {providerID:'claude-agent',id:'model[1m]',enabled:true,variants:[]},
    {providerID:'zai',id:'disabled',enabled:false,variants:[]}
  ]}));\n`);
  chmodSync(command, 0o700);
  const catalog = await discoverOpenCodeModels({ command, cwd: root });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'zai/glm-5.3-flash');
  assert.deepEqual(catalog[0].variants, ['low', 'high']);
});

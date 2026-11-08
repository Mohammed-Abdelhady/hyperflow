import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DELEGATE_REVISION = '7f8ae3435e5bc68a54efdca9f67797e905845562';
const RELAYS = {
  opencode: 'fbf19ca09b15749ac2cad5ad8a8bb8a8518888e1842c6d03760e7680ba799899',
  codex: 'd857cfccf408e12d86b4a969c8c4544294919fe253a0096820ed9ed4d24fab5c',
  claude: 'c7283e9765df0771601b2774433858f98e5db18c65d2eb505105c9d2037e89fe',
  agy: '926575fafe26779b44c2d0d736f7ff03d656a7302729380f3d1f7097d07bca71',
  cursor: 'ac129422726d7ba6b750b3462d05c55c1c1caf47c93a04372210a5fca0a2156f',
  pi: 'a78bb502780e586d9426e47fe8d8da58b4e561aef0cbe008efa971cac032dc5f',
};
const BASE = `https://raw.githubusercontent.com/amElnagdy/delegate-skills/${DELEGATE_REVISION}`;
const MAX_DEPENDENCY_BYTES = 131_072;

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Dependency download failed: ${response.status}`);
  const reader = response.body.getReader();
  const buffers = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_DEPENDENCY_BYTES) { await reader.cancel(); throw new Error('Dependency exceeds size bound'); }
    buffers.push(Buffer.from(value));
  }
  return Buffer.concat(buffers);
}

export async function setupDelegates(destination = join(homedir(), '.local/share/hyperflow/delegate-skills')) {
  const license = await download(`${BASE}/LICENSE`);
  if (!license.toString('utf8').includes('Copyright (c) 2026 Ahmed Mohammed')) throw new Error('Missing upstream license');
  const verified = [];
  for (const [harness, sha256] of Object.entries(RELAYS)) {
    const bytes = await download(`${BASE}/skills/${harness}-delegate/scripts/relay.mjs`);
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Delegate ${harness} relay integrity mismatch`);
    verified.push({ harness, sha256, bytes });
  }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  writeFileSync(join(destination, 'LICENSE'), license, { mode: 0o600 });
  const installed = [];
  for (const { harness, sha256, bytes } of verified) {
    const path = join(destination, `${harness}-relay.mjs`);
    const temporary = `${path}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, path);
    } finally { rmSync(temporary, { force: true }); }
    installed.push({ harness, path, sha256 });
  }
  return { revision: DELEGATE_REVISION, installed };
}

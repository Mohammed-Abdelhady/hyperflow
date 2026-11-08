import { runProcess } from './process.mjs';
import { configuredClaudeModels, configuredHarnessModels, discoverCodexModels } from './catalog-native.mjs';

const RELAY_MODEL_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@~/#-]*$/;

export async function discoverOpenCodeModels({ command = 'opencode', cwd = process.cwd(), signal } = {}) {
  const result = await runProcess(command, ['api', '--standalone', 'model.list'], { cwd, signal, timeoutMs: 30_000 });
  if (result.code !== 0) throw new Error('OpenCode model discovery failed');
  const response = JSON.parse(result.stdout);
  const models = Array.isArray(response) ? response : response.data;
  if (!Array.isArray(models)) throw new Error('OpenCode did not return a supported model catalog');
  return models.filter((model) => model.enabled !== false && RELAY_MODEL_TOKEN.test(`${model.providerID}/${model.id}`)).map((model) => {
    if (typeof model.providerID !== 'string' || typeof model.id !== 'string') throw new Error('Invalid OpenCode model descriptor');
    return { id: `${model.providerID}/${model.id}`, adapter: 'opencode',
      variants: Array.isArray(model.variants) ? model.variants.map((variant) => variant.id) : [],
      capabilities: ['implementation', 'review'], source: 'native-catalog' };
  });
}

export async function discoverCatalog({ cwd = process.cwd(), signal, configured = [] } = {}) {
  const wanted = [...new Set(configured.map((profile) => profile.adapter ?? profile.harness).filter(Boolean))];
  const harnesses = wanted.length ? wanted : ['codex', 'opencode', 'claude-code', 'antigravity', 'cursor', 'pi'];
  const sources = { opencode: () => discoverOpenCodeModels({ cwd, signal }),
    codex: () => discoverCodexModels({ cwd, signal }),
    'claude-code': () => configuredClaudeModels(configured, { cwd, signal }),
    ...Object.fromEntries(['antigravity', 'cursor', 'pi'].map((harness) => [harness,
      () => configuredHarnessModels(harness, configured, { cwd, signal })])) };
  const results = await Promise.allSettled(harnesses.map((harness) => {
    if (!sources[harness]) throw new Error(`Unsupported harness: ${harness}`);
    return sources[harness]();
  }));
  const models = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!models.length) throw new Error(`No selected harness exposed a usable model catalog. ${results.map((result) =>
    result.status === 'rejected' ? result.reason.message : '').filter(Boolean).join('; ')}`);
  return models;
}

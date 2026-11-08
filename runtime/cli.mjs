#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { repositoryRoot, planCommand } from './cli-plan.mjs';
import { setupDelegates } from './setup-delegates.mjs';

const HELP = {
  commands: ['plan <draft.json>', 'answer <workflow-id> <answers.json>', 'compile <workflow-id>',
    'smash <workflow.mjs>', 'status|graph|stop|resume <run-id>', 'sessions', 'rename <run-id> <name>',
    'messages <run-id> [message.json]', 'crash <base> <head> | <PR-URL>',
    'agents-config [set profile harness model [project|global|session run-id]]', 'setup-delegates'],
};

export async function main(args = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') return HELP;
  if (command === 'setup-delegates') {
    if (rest.length) throw new Error('setup-delegates accepts no arguments');
    return setupDelegates();
  }
  const root = repositoryRoot(cwd);
  if (['plan', 'answer', 'compile'].includes(command)) return planCommand(command, rest, root);
  const { controlCommand } = await import('./cli-control.mjs');
  if (['status', 'graph', 'stop', 'sessions', 'rename', 'messages', 'agents-config'].includes(command)) {
    return controlCommand(command, rest, root);
  }
  const { executionCommand } = await import('./cli-execution.mjs');
  if (['smash', 'resume', 'crash'].includes(command)) return executionCommand(command, rest, root);
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (['failed', 'blocked', 'cancelled'].includes(result?.status)) process.exitCode = 1;
  }).catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', message: error.message })}\n`);
    process.exitCode = 1;
  });
}

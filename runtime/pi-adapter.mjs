import { runProcess } from './process.mjs';
import { EFFORT_LEVELS } from './task-contract.mjs';

const EFFORTS = new Set(EFFORT_LEVELS);
const READ_TOOLS = new Set(['read', 'grep', 'find', 'ls']);
const WRITE_TOOLS = 'read,bash,edit,write,grep,find,ls';

export async function runPiTask({ command = 'pi', cwd, model, effort, brief, readOnly, signal, timeoutMs }) {
  if (!EFFORTS.has(effort)) throw new Error('Pi requires an explicit low, medium, or high effort');
  const args = ['--mode', 'json', '--print', '--no-session', '--no-context-files', '--no-skills',
    '--no-prompt-templates', '--no-themes', '--no-extensions', '--no-mcp', '--no-approve', '--model', model, '--thinking', effort,
    '--tools', readOnly ? [...READ_TOOLS].join(',') : WRITE_TOOLS];
  const execution = await runProcess(command, args, { cwd, signal, timeoutMs, input: brief });
  if (execution.code !== 0) throw new Error(`Pi delegate failed with exit ${execution.code}`);
  let sessionId;
  let final;
  let completed = false;
  for (const line of execution.stdout.split('\n').filter((entry) => entry.trim())) {
    const event = JSON.parse(line);
    if (event.type === 'session') sessionId = event.id;
    if (event.type === 'tool_execution_start' && readOnly && !READ_TOOLS.has(event.toolName)) {
      throw new Error('Pi read-only delegate attempted a disallowed tool');
    }
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const message = event.message;
      if (message.errorMessage || ['error', 'aborted'].includes(message.stopReason)) throw new Error('Pi provider failed');
      if (typeof message.provider !== 'string' || typeof message.model !== 'string' ||
          ![message.model, `${message.provider}/${message.model}`].includes(model)) throw new Error('Pi reported a different model');
      if (message.thinkingLevel !== effort) throw new Error('Pi did not confirm the planned effort');
      if (readOnly && (message.content ?? []).some((part) => part.type === 'toolCall' && !READ_TOOLS.has(part.name))) {
        throw new Error('Pi read-only delegate attempted a disallowed tool');
      }
      final = message;
      completed = false;
    }
    if (event.type === 'agent_end') completed = event.willRetry !== true;
  }
  const text = final?.content?.filter((part) => part.type === 'text').map((part) => part.text).join('\n');
  if (!completed || final?.stopReason !== 'stop' || !text?.trim()) throw new Error('Pi did not complete a final response');
  return { schema: 'delegate-relay.result.v1', status: 'completed', exitCode: 0, model, effort,
    actualModel: final.model, actualProvider: final.provider, appliedEffort: final.thinkingLevel,
    sessionId, finalMessage: text };
}

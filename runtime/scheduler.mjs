import { randomUUID } from 'node:crypto';
import { freemem } from 'node:os';
import path from 'node:path';
import { RunStore } from './store.mjs';
import { validateWorkflow } from './workflow.mjs';
import { runChecks } from './command.mjs';
import { effortLevel, MAX_REPAIR_ROUNDS, runSecurityGate, validateFindings } from './review-policy.mjs';
import {
  applyIntegratedChanges, assertChangesScoped, assertCommitScoped, commitTaskChanges,
  acquireRepositoryLock, assertNoScopeSymlinks, assertValidScopes, changedPaths, createExecutionWorktree, git, integrateTaskChanges, scopesOverlap
} from './worktrees.mjs';

const MAX_CAPACITY = 3;
const MAX_BROWSER_SPACES = 5;
const MAX_SIMULATORS = 3;
const DEFAULT_SIMULATORS = 2;
const MEMORY_PER_TASK_BYTES = 2 * 1024 ** 3;

export async function executeWorkflow({ workflow, digest, repoRoot, statePath, roles, adapter, checks, review, signal, capacity, context, runId }) {
  workflow = validateWorkflow(workflow);
  validateExecution({ workflow, digest, repoRoot, statePath, roles, adapter, checks, review });
  const tasks = workflow.tasks;
  assertValidScopes(tasks);
  const store = new RunStore(statePath);
  const roleSet = normalizeRoles(roles);
  let releaseLock;
  let run;
  try {
    if (runId) {
      releaseLock = await acquireRepositoryLock(repoRoot, runId);
      store.reconcile(runId);
      run = store.resumeRun(runId, { workflow, digest, repoRoot });
      store.setRoles(run.runId, roleSet);
    } else run = store.createRun({ workflow, digest, repoRoot, roles: roleSet });
  } catch (error) {
    if (releaseLock) await releaseLock();
    store.close();
    throw error;
  }
  const controller = new AbortController();
  const relayAbort = () => controller.abort(signal?.reason ?? new Error('Workflow stopped'));
  signal?.addEventListener('abort', relayAbort, { once: true });
  const onAbort = () => { if (store.getRun(run.runId)?.status !== 'stopped') store.stop(run.runId); };
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const baseSha = workflow.repository.baseSha;
  const integrationRef = `refs/hyperflow/runs/${run.runId}`;
  const active = new Map();
  const completed = new Set(Object.entries(run.tasks).filter(([, value]) => value.status === 'completed').map(([id]) => id));
  const failed = new Set(Object.entries(run.tasks).filter(([, value]) => value.status === 'failed').map(([id]) => id));
  const blocked = new Set();
  const taskChanges = tasks.filter(task => completed.has(task.id)).map(task => ({ task, paths: run.tasks[task.id].result?.paths ?? [] }));
  const resources = normalizeCapacity(capacity);
  let integrationQueue = Promise.resolve();
  let integration;
  const stopMonitor = setInterval(() => {
    if (store.getRun(run.runId)?.status === 'stopped' && !controller.signal.aborted) controller.abort(new Error('Run stopped by another process'));
  }, 100);
  try {
    if (!releaseLock) releaseLock = await acquireRepositoryLock(repoRoot, run.runId);
    const integrationBase = run.integrationHead ?? baseSha;
    await git(repoRoot, ['update-ref', integrationRef, integrationBase]);
    integration = await createExecutionWorktree(repoRoot, integrationRef);
    while (completed.size + failed.size + blocked.size < tasks.length && !controller.signal.aborted) {
      let dispatched = false;
      for (const task of tasks) {
        if (failed.has(task.id) || blocked.has(task.id) || completed.has(task.id)) continue;
        if (task.dependsOn.some(id => failed.has(id) || blocked.has(id))) {
          blocked.add(task.id);
          store.setTaskStatus(run.runId, task.id, 'blocked', 'A dependency did not complete');
          continue;
        }
        if (active.has(task.id) || !task.dependsOn.every(id => completed.has(id))) continue;
        const running = [...active.values()].map(item => item.task);
        if (running.some(item => scopesOverlap(item.writeScope ?? [], task.writeScope ?? [])) || !fitsResources(running, task, resources)) continue;
        const lease = store.claimTask(run.runId, task.id, `runner-${randomUUID()}`);
        if (!lease) continue;
        const currentRun = store.getRun(run.runId);
        const currentRoles = { revision: currentRun.roleRevision, roles: currentRun.roles };
        const dependencyResults = Object.fromEntries(task.dependsOn.map(id => [id, currentRun.tasks[id].result]));
        const integrate = operation => { const next = integrationQueue.then(operation); integrationQueue = next.catch(() => {}); return next; };
        const taskPromise = executeTask({ task, lease, integration: integration.path, repoRoot, roles: currentRoles, adapter, checks, review,
          signal: controller.signal, context, dependencyResults, integrate, evidenceDirectory: path.join(`${statePath}.evidence`, run.runId, task.id.replace(/[^A-Za-z0-9._-]/g, '_')) }).then(async result => {
            if (store.completeTask(run.runId, task.id, lease.token, result)) {
              await git(repoRoot, ['update-ref', integrationRef, result.integrationHead]);
              if (result.paths.length) taskChanges.push({ task, paths: result.paths });
              completed.add(task.id);
            }
            return { task, error: null };
          }).catch(error => {
            store.failTask(run.runId, task.id, lease.token, error);
            if (store.getRun(run.runId)?.status !== 'stopped') store.setRunStatus(run.runId, 'running');
            return { task, error };
          });
        active.set(task.id, { task, promise: taskPromise });
        dispatched = true;
      }
      if (active.size) {
        const settled = await Promise.race([...active].map(async ([id, item]) => ({ id, outcome: await item.promise })));
        active.delete(settled.id);
        if (settled.outcome.error) failed.add(settled.id);
      } else if (!dispatched && completed.size + failed.size + blocked.size < tasks.length) {
        for (const task of tasks) {
          if (!completed.has(task.id) && !failed.has(task.id) && !blocked.has(task.id)) {
            blocked.add(task.id);
            store.setTaskStatus(run.runId, task.id, 'blocked', 'No runnable dependency or available capacity');
          }
        }
      }
    }
    if (controller.signal.aborted) {
      await Promise.allSettled([...active.values()].map(item => item.promise));
      store.setRunStatus(run.runId, 'stopped');
      return resultFor(store, run.runId);
    }
    if (failed.size || blocked.size) {
      store.setRunStatus(run.runId, 'failed', new Error('One or more tasks failed or were blocked'));
      return resultFor(store, run.runId);
    }
    const finalChecks = [];
    for (const task of tasks) finalChecks.push({ taskId: task.id, receipts: await runChecks(task, checks, integration.path, controller.signal, path.join(`${statePath}.evidence`, run.runId, 'final', task.id.replace(/[^A-Za-z0-9._-]/g, '_'))) });
    if (controller.signal.aborted) throw controller.signal.reason ?? new Error('Workflow stopped');
    const gateRun = store.getRun(run.runId);
    const gate = await runSecurityGate({ workflow, tasks, repoRoot, integrationPath: integration.path,
      roles: { revision: gateRun.roleRevision, roles: gateRun.roles }, adapter, checks, review,
      signal: controller.signal, evidenceDirectory: path.join(`${statePath}.evidence`, run.runId, 'gate') });
    await git(repoRoot, ['update-ref', integrationRef, gate.integrationHead]);
    store.setIntegrationHead(run.runId, gate.integrationHead);
    if (gate.taskChange) taskChanges.push(gate.taskChange);
    store.setFinalEvidence(run.runId, { checks: finalChecks, integrationHead: gate.integrationHead,
      security: { verdict: gate.verdict, baseSha: gate.baseSha, integrationHead: gate.integrationHead, reviews: gate.reviews, fixes: gate.fixes } });
    if (controller.signal.aborted) throw controller.signal.reason ?? new Error('Workflow stopped');
    await applyIntegratedChanges(integration.path, repoRoot, baseSha, taskChanges, controller.signal);
    await git(repoRoot, ['update-ref', '-d', integrationRef]);
    store.setRunStatus(run.runId, 'completed');
    return resultFor(store, run.runId);
  } catch (error) {
    if (store.getRun(run.runId)?.status !== 'stopped') store.setRunStatus(run.runId, 'failed', error);
    if (error?.evidence) store.setFinalEvidence(run.runId, { checkFailure: error.evidence, error: String(error.message ?? error) });
    return resultFor(store, run.runId);
  } finally {
    clearInterval(stopMonitor);
    signal?.removeEventListener('abort', relayAbort);
    controller.signal.removeEventListener('abort', onAbort);
    if (integration) await integration.cleanup();
    if (releaseLock) await releaseLock();
    store.close();
  }
}

async function executeTask({ task, lease, integration, repoRoot, roles, adapter, checks, review, signal, context, dependencyResults, integrate, evidenceDirectory }) {
  const selectedModel = roles.roles[task.agentRole];
  const reviewModel = roles.roles.primary;
  if (!reviewModel) throw new Error(`No primary reviewer profile is configured for ${task.id}`);
  const reviewEffort = task.reviewEffort ?? 'high';
  const branchBase = await git(integration, ['rev-parse', 'HEAD']);
  const taskWorktree = await createExecutionWorktree(repoRoot, branchBase);
  let findings = [];
  let verificationFailure;
  try {
    for (let repairRound = 0; repairRound <= MAX_REPAIR_ROUNDS; repairRound += 1) {
      if (signal.aborted) throw signal.reason ?? new Error('Workflow stopped');
      await assertNoScopeSymlinks(taskWorktree.path, task);
      const taskContext = context ? await context(task, taskWorktree.path, dependencyResults) : undefined;
      const repairContext = { ...(findings.length ? { reviewFindings: findings } : {}), ...(verificationFailure ? { verificationFailure } : {}) };
      const adapterContext = Object.keys(repairContext).length ? { taskContext, ...repairContext } : taskContext;
      const output = await adapter({ task, context: adapterContext,
        cwd: taskWorktree.path, model: selectedModel, effort: task.effort, signal, attempt: lease.attempt + repairRound });
      if (signal.aborted) throw signal.reason ?? new Error('Workflow stopped');
      if (output?.status !== 'completed') throw new Error(`Adapter did not complete ${task.id}: ${output?.status ?? 'unknown status'}`);
      await assertNoScopeSymlinks(taskWorktree.path, task);
      await assertChangesScoped(taskWorktree.path, task);
      const candidateHead = await commitTaskChanges(taskWorktree.path, task);
      const candidatePaths = await assertCommitScoped(taskWorktree.path, task, branchBase, candidateHead);
      if ((task.writeScope ?? []).length && !candidatePaths.length) throw new Error(`Task ${task.id} completed without a scoped change`);
      let candidateChecks;
      try { candidateChecks = await runChecks(task, checks, taskWorktree.path, signal, evidenceDirectory); }
      catch (error) {
        if (!isCheckFailureEvidence(error) || repairRound === MAX_REPAIR_ROUNDS) throw error;
        if ((await changedPaths(taskWorktree.path)).length) throw new Error(`Checks modified task ${task.id}'s candidate tree`);
        verificationFailure = error.evidence;
        continue;
      }
      verificationFailure = undefined;
      if ((await changedPaths(taskWorktree.path)).length) throw new Error(`Checks modified task ${task.id}'s candidate tree`);
      let candidate;
      try {
        candidate = await integrate(async () => {
          const reviewBaseSha = await git(integration, ['rev-parse', 'HEAD']);
          const reviewWorktree = await createExecutionWorktree(repoRoot, reviewBaseSha);
          try {
            const merged = await integrateTaskChanges(taskWorktree.path, reviewWorktree.path, task, branchBase);
            const integratedChecks = await runIntegratedChecks(task, checks, reviewWorktree.path, signal, evidenceDirectory);
            if ((await changedPaths(reviewWorktree.path)).length) throw new Error(`Checks modified the integrated candidate for ${task.id}`);
            const reviewLane = { id: randomUUID(), path: reviewWorktree.path };
            const verdict = await review({ task, phase: 'correctness-review', cwd: reviewWorktree.path, baseSha: reviewBaseSha, headSha: merged.headSha,
              model: reviewModel, effort: reviewEffort, lane: reviewLane, signal });
            if (signal.aborted) throw signal.reason ?? new Error('Workflow stopped');
            if (await git(reviewWorktree.path, ['rev-parse', 'HEAD']) !== merged.headSha) throw new Error('Reviewer changed the reviewed candidate');
            if ((await changedPaths(reviewWorktree.path)).length) throw new Error('Reviewer left candidate changes behind');
            if (verdict?.verdict === 'pass') {
              if (!Array.isArray(verdict.findings) || verdict.findings.length) throw new Error(`Passing review returned findings for ${task.id}`);
              if (signal.aborted) throw signal.reason ?? new Error('Workflow stopped');
              await git(integration, ['reset', '--hard', merged.headSha]);
              if (signal.aborted) {
                await git(integration, ['reset', '--hard', reviewBaseSha]);
                throw signal.reason ?? new Error('Workflow stopped');
              }
            } else if (verdict?.verdict === 'needs_fix') validateFindings(verdict.findings, merged.paths);
            else if (verdict?.verdict !== 'blocked') throw new Error(`Invalid review verdict for ${task.id}`);
            return { ...merged, reviewBaseSha, verdict, integratedChecks, reviewLane };
          } finally { await reviewWorktree.cleanup(); }
        });
      } catch (error) {
        if (error?.checkPhase !== 'integrated-candidate' || !isCheckFailureEvidence(error) || repairRound === MAX_REPAIR_ROUNDS) throw error;
        verificationFailure = error.evidence;
        continue;
      }
      if (candidate.verdict?.verdict === 'pass') {
        return {
        status: 'completed', attempt: lease.attempt + repairRound, sessionId: output.sessionId,
        summary: output.summary, artifacts: output.artifacts, touchedFiles: candidate.paths, paths: candidate.paths,
        integrationHead: candidate.headSha, model: output.model ?? selectedModel.model, adapter: output.adapter ?? selectedModel.adapter,
        requestedVariant: output.requestedVariant ?? selectedModel.variant ?? null, appliedVariant: output.appliedVariant ?? null, effort: task.effort,
        checkEvidence: { task: candidateChecks, integrated: candidate.integratedChecks },
        review: { verdict: 'pass', phase: 'correctness-review', role: 'primary', effort: reviewEffort, baseSha: candidate.reviewBaseSha,
          headSha: candidate.headSha, model: reviewModel.model, adapter: reviewModel.adapter, lane: candidate.reviewLane, sessionId: candidate.verdict.sessionId ?? null }
        };
      }
      if (candidate.verdict?.verdict !== 'needs_fix') throw new Error(`Independent review blocked ${task.id}`);
      if (repairRound === MAX_REPAIR_ROUNDS) throw new Error(`Repair limit reached for ${task.id}`);
      findings = validateFindings(candidate.verdict.findings, candidate.paths);
    }
    throw new Error(`Repair limit reached for ${task.id}`);
  } finally { await taskWorktree.cleanup(); }
}

function validateExecution(input) {
  if (input.workflow.schemaVersion !== 2) throw new TypeError('Execution requires a schema 2 workflow; replan and approve historic workflows before execution');
  if (!input.workflow || !Array.isArray(input.workflow.tasks) || !input.workflow.tasks.length) throw new TypeError('Workflow must contain tasks');
  if (!input.digest || !input.repoRoot || !input.statePath || !input.roles || typeof input.adapter !== 'function' || typeof input.review !== 'function') {
    throw new TypeError('Execution requires workflow, digest, repository, state, roles, adapter, checks, and independent review');
  }
  if (!input.checks || typeof input.checks !== 'object') throw new TypeError('A check registry is required');
  const ids = new Set(input.workflow.tasks.map(task => task.id));
  for (const task of input.workflow.tasks) {
    if (!task.id || !Array.isArray(task.dependsOn) || !Array.isArray(task.writeScope) || !Array.isArray(task.checks) || !task.acceptance?.length) throw new TypeError(`Task ${task.id ?? '?'} is missing execution contract fields`);
    const bindings = normalizeRoles(input.roles).roles;
    if (!bindings[task.agentRole]) throw new Error(`No model profile is configured for ${task.id}: ${task.agentRole}`);
    if (task.reviewRole !== 'primary') throw new Error(`Task ${task.id} must be reviewed by the primary reviewer profile`);
    const difficulty = task.difficulty ?? 'routine';
    if (task.agentRole !== (difficulty === 'routine' ? 'lightweight' : 'general')) throw new Error(`Task ${task.id} routes ${difficulty} work to ${task.agentRole}`);
    for (const dependency of task.dependsOn) if (!ids.has(dependency)) throw new Error(`Unknown dependency ${dependency} for ${task.id}`);
    for (const resource of ['browserSpaces', 'simulators']) {
      const count = task.resources?.[resource] ?? 0;
      if (!Number.isInteger(count) || count < 0) throw new TypeError(`Task ${task.id} has invalid ${resource} demand`);
    }
    for (const checkId of task.checks) {
      const check = input.checks[checkId];
      if (!check || typeof check.command !== 'string' || !Array.isArray(check.args) || check.args.some(arg => typeof arg !== 'string')) throw new Error(`Missing or invalid registered check: ${checkId}`);
    }
  }
  if (!input.workflow.repository?.baseSha) throw new TypeError('Workflow must pin repository.baseSha');
  const bindings = normalizeRoles(input.roles).roles;
  if (!bindings.primary) throw new Error('No primary reviewer profile is configured for correctness reviews');
  if (!bindings.general) throw new Error('No general profile is configured for the consolidated security review and its repairs');
  effortLevel(input.workflow.securityReviewEffort ?? 'high', 'workflow.securityReviewEffort');
  effortLevel(input.workflow.securityFixEffort ?? 'high', 'workflow.securityFixEffort');
  normalizeRoles(input.roles);
}

function normalizeRoles(input) {
  const bindings = input?.roles && typeof input.roles === 'object' ? input.roles : Object.fromEntries(Object.entries(input ?? {}).filter(([key]) => key !== 'revision' && key !== 'roleRevision'));
  const revision = input?.revision ?? input?.roleRevision ?? 'initial';
  const entries = Object.entries(bindings);
  if (!revision || !entries.length || entries.some(([key, item]) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127})?$/.test(key) || typeof item?.model !== 'string' || typeof item?.adapter !== 'string')) throw new TypeError('Roles require valid model profile bindings');
  return { revision, roles: bindings };
}

function isCheckFailureEvidence(error) {
  const receipt = error?.evidence;
  return Boolean(receipt && typeof receipt.command === 'string' && Array.isArray(receipt.args) &&
    Number.isInteger(receipt.exitCode) && receipt.exitCode !== 0 && typeof receipt.stdoutRef === 'string' && typeof receipt.stderrRef === 'string');
}

async function runIntegratedChecks(task, checks, cwd, signal, evidenceDirectory) {
  try { return await runChecks(task, checks, cwd, signal, evidenceDirectory); }
  catch (error) {
    if (!isCheckFailureEvidence(error)) throw error;
    throw Object.assign(new Error(error.message), { evidence: error.evidence, checkPhase: 'integrated-candidate' });
  }
}

function normalizeCapacity(value) {
  const descriptor = typeof value === 'number' ? { tasks: value } : value ?? {};
  const availableMemoryBytes = descriptor.availableMemoryBytes ?? freemem();
  if (!Number.isFinite(availableMemoryBytes) || availableMemoryBytes < 0) throw new TypeError('availableMemoryBytes must be measured and non-negative');
  const memoryLimit = Math.min(MAX_CAPACITY, Math.floor(availableMemoryBytes / MEMORY_PER_TASK_BYTES));
  const requestedTasks = descriptor.tasks ?? Math.min(2, memoryLimit);
  if (!Number.isInteger(requestedTasks) || requestedTasks < 0 || requestedTasks > MAX_CAPACITY) throw new RangeError(`Task capacity must be between 1 and ${MAX_CAPACITY}`);
  const browserSpaces = descriptor.browserSpaces ?? 0;
  const availableSimulators = descriptor.simulators ?? 0;
  const simulatorLimit = descriptor.simulatorLimit ?? DEFAULT_SIMULATORS;
  const simulators = Math.min(availableSimulators, simulatorLimit);
  if (!Number.isInteger(browserSpaces) || browserSpaces < 0 || browserSpaces > MAX_BROWSER_SPACES || !Number.isInteger(availableSimulators) || availableSimulators < 0 || availableSimulators > MAX_SIMULATORS || !Number.isInteger(simulatorLimit) || simulatorLimit < 0 || simulatorLimit > MAX_SIMULATORS) {
    throw new RangeError('Requested capability capacity exceeds supported limits');
  }
  return { tasks: Math.min(requestedTasks, memoryLimit), browserSpaces, simulators };
}

function fitsResources(running, next, capacity) {
  if (running.length >= capacity.tasks) return false;
  const combined = [...running, next];
  if (combined.filter(task => task.resources?.heavy).length > 1) return false;
  return ['browserSpaces', 'simulators'].every(key => combined.reduce((sum, task) => sum + (task.resources?.[key] ?? 0), 0) <= (capacity[key] ?? 0));
}

function resultFor(store, runId) {
  const run = store.getRun(runId);
  return { runId, status: run.status, error: run.error, roleRevision: run.roleRevision, finalEvidence: run.finalEvidence, tasks: run.tasks };
}

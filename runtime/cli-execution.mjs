import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectReviewAssignments, validateAssignments } from './assignments.mjs';
import { RunStore } from './store.mjs';
import { executeWorkflow } from './scheduler.mjs';
import { loadWorkflow } from './workflow.mjs';
import { assembleContext } from './context.mjs';
import { discoverCatalog } from './catalog.mjs';
import { effectiveRoles, configuredProfiles } from './config.mjs';
import { loadChecks, validateChecks } from './checks.mjs';
import { validateApproval, validateApprovedRoles } from './cli-plan.mjs';
import { statePath } from './cli-control.mjs';
import { createAdapter } from './relay.mjs';
import { createReviewer, resolveReviewRange } from './review.mjs';
import { aggregateReviews, validateReviewOutcome } from './review-policy.mjs';
import { snapshotCurrentDiff } from './review-snapshot.mjs';
import { resolvePullRequest } from './pr.mjs';
import { artifactPath, readJson, SLUG, writeJson } from './files.mjs';

export async function executionCommand(command, args, root) {
  if (command === 'crash') return crash(args, root);
  if (args.length !== 1) throw new Error(`Usage: ${command} <${command === 'resume' ? 'run-id' : 'workflow.mjs'}>`);
  let runId;
  let loaded;
  let sessionRoles;
  if (command === 'resume') {
    if (!SLUG.test(args[0])) throw new Error('A run ID is required');
    const store = new RunStore(statePath(root));
    try {
      const saved = store.getRun(args[0]);
      runId = saved.id ?? saved.runId;
      loaded = { workflow: saved.workflow, digest: saved.digest };
      sessionRoles = saved.roles;
    } finally { store.close(); }
  } else loaded = await loadWorkflow(resolve(args[0]));
  const { workflow, digest } = loaded;
  if (workflow.schemaVersion !== 2) throw new Error('Workflow schema 1 is historic and cannot execute; replan it with hyperflow plan and approve the schema 2 workflow before running smash');
  if (resolve(workflow.repository.root) !== root) throw new Error('Workflow belongs to another repository');
  const approval = validateApproval(root, workflow, digest);
  const checks = loadChecks(root);
  validateChecks(workflow, checks);
  const catalog = await discoverCatalog({ cwd: root, configured: configuredProfiles(root, sessionRoles) });
  const roles = effectiveRoles({ repoRoot: root, catalog, session: sessionRoles });
  validateApprovedRoles(approval, roles);
  validateAssignments(workflow, roles, catalog);
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Hyperflow execution interrupted'));
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  try {
    const adapter = createAdapter();
    return await executeWorkflow({ workflow, digest, repoRoot: root, statePath: statePath(root), roles,
      runId, checks, review: createReviewer(), signal: controller.signal, capacity: hostCapacity(),
      context: async (task, cwd, dependencies) => {
        const dependencyResults = Object.entries(dependencies ?? {}).map(([taskId, result]) => ({
          taskId, summary: result.summary ?? '', headSha: result.integrationHead ?? result.review?.headSha ?? '',
        }));
        const bundle = await assembleContext({ repoRoot: cwd, task, workflow, dependencyResults });
        return bundle.text;
      },
      adapter: async (turn) => adapter({ ...turn,
        context: typeof turn.context === 'string' ? turn.context : JSON.stringify(turn.context ?? {}) }) });
  } finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

async function crash(args, root) {
  if (args.length > 2) throw new Error('Usage: crash <base> <head> or crash <PR-URL>');
  const range = !args.length ? snapshotCurrentDiff(root) : args[0].startsWith('https://')
    ? await resolvePullRequest(root, args[0]) : resolveReviewRange(root, args[0], args[1] ?? 'HEAD');
  const temporary = mkdtempSync(join(tmpdir(), 'hyperflow-review-'));
  const git = (argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8' });
  git(['worktree', 'add', '--detach', join(temporary, 'checkout'), range.headSha]);
  try {
    const catalog = await discoverCatalog({ cwd: root, configured: configuredProfiles(root) });
    const assignments = selectReviewAssignments(effectiveRoles({ repoRoot: root, catalog }), catalog);
    const reviewer = createReviewer();
    const task = { id: 'PR', title: 'Review the pinned change', acceptance: ['No unresolved correctness, security or regression findings'],
      writeScope: [], readScope: [], checks: [] };
    const correctness = await reviewer({ task, phase: 'correctness-review', cwd: join(temporary, 'checkout'), ...range,
      model: assignments.correctness.model, effort: assignments.correctness.effort });
    const securityCheckout = join(temporary, 'security-checkout');
    git(['worktree', 'add', '--detach', securityCheckout, range.headSha]);
    let security;
    try {
      security = await reviewer({ task, phase: 'security-review', cwd: securityCheckout, ...range,
        model: assignments.security.model, effort: assignments.security.effort });
    } finally {
      try { git(['worktree', 'remove', '--force', securityCheckout]); }
      finally { rmSync(securityCheckout, { recursive: true, force: true }); }
    }
    const current = !args.length ? snapshotCurrentDiff(root) : args[0].startsWith('https://')
      ? await resolvePullRequest(root, args[0]) : resolveReviewRange(root, args[0], args[1] ?? 'HEAD');
    if (current.baseSha !== range.baseSha || (range.current ? current.sourceTree !== range.sourceTree : current.headSha !== range.headSha)) throw new Error('Review head changed during review; findings are stale');
    const outcome = aggregateReviews([validateReviewOutcome(correctness, 'correctness-review'), validateReviewOutcome(security, 'security-review')]);
    const path = artifactPath(root, 'audits', `${range.headSha}.json`);
    writeJson(path, { ...range, ...outcome, correctness, security });
    return { ...outcome, ...range, correctness, security, artifact: path, status: outcome.verdict === 'pass' ? 'completed' : 'blocked' };
  } finally {
    try { git(['worktree', 'remove', '--force', join(temporary, 'checkout')]); }
    finally { rmSync(temporary, { recursive: true, force: true }); }
  }
}

function hostCapacity() {
  if (!process.env.HYPERFLOW_CAPABILITIES) return undefined;
  const report = readJson(process.env.HYPERFLOW_CAPABILITIES);
  if (typeof report.measuredAt !== 'number' || report.measuredAt > Date.now() || Date.now() - report.measuredAt > 60_000) {
    throw new Error('Host capability report is missing or stale');
  }
  return report.capacity;
}

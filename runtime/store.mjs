import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_LEASE_MS = 10 * 60 * 1000;

export class RunStore {
  constructor(filePath) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, label TEXT, workflow TEXT NOT NULL, digest TEXT NOT NULL,
        repo_root TEXT NOT NULL, roles TEXT NOT NULL, role_revision TEXT NOT NULL, integration_head TEXT, status TEXT NOT NULL,
        generation INTEGER NOT NULL DEFAULT 0, error TEXT, final_evidence TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, task_id TEXT NOT NULL,
        status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, lease_token TEXT,
        lease_owner TEXT, lease_until INTEGER, result TEXT, error TEXT, evidence TEXT,
        PRIMARY KEY (run_id, task_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        from_task TEXT NOT NULL, to_task TEXT, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_by_run ON messages(run_id, created_at);
    `);
  }

  createRun({ workflow, digest, repoRoot, roles }) {
    const runId = randomUUID();
    const roleSet = normalizeRoles(roles);
    const now = new Date().toISOString();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare(`INSERT INTO runs (id,workflow,digest,repo_root,roles,role_revision,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(runId, JSON.stringify(workflow), digest, repoRoot, JSON.stringify(roleSet.bindings), roleSet.revision, 'running', now, now);
      const insert = this.database.prepare('INSERT INTO tasks (run_id,task_id,status) VALUES (?,?,?)');
      for (const task of workflow.tasks) insert.run(runId, task.id, 'queued');
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.getRun(runId);
  }

  getRun(runId) {
    const row = this.database.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!row) return null;
    const taskRows = this.database.prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY rowid').all(runId);
    return this.#decodeRun(row, taskRows);
  }

  listRuns() {
    return this.database.prepare('SELECT * FROM runs ORDER BY created_at DESC, rowid DESC').all()
      .map(row => this.#decodeRun(row, this.database.prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY rowid').all(row.id)));
  }

  rename(runId, label) {
    if (typeof label !== 'string' || !label.trim()) throw new TypeError('Run label must be non-empty');
    const result = this.database.prepare('UPDATE runs SET label = ?, updated_at = ? WHERE id = ?')
      .run(label.trim(), new Date().toISOString(), runId);
    if (result.changes !== 1) throw new Error(`Unknown run ${runId}`);
    return this.getRun(runId);
  }

  setRoles(runId, roles) {
    const roleSet = normalizeRoles(roles);
    const result = this.database.prepare("UPDATE runs SET roles=?,role_revision=?,updated_at=? WHERE id=? AND status IN ('running','recovering')")
      .run(JSON.stringify(roleSet.bindings), roleSet.revision, new Date().toISOString(), runId);
    if (!result.changes) throw new Error(`Cannot update roles for run ${runId}`);
    return this.getRun(runId);
  }

  setIntegrationHead(runId, headSha) {
    const result = this.database.prepare("UPDATE runs SET integration_head=?,updated_at=? WHERE id=? AND status IN ('running','recovering')")
      .run(headSha, new Date().toISOString(), runId);
    if (!result.changes) throw new Error(`Cannot update integration head for run ${runId}`);
  }

  setTaskStatus(runId, taskId, status, error = null) {
    if (!['queued','running','completed','failed','blocked','stopped'].includes(status)) throw new TypeError(`Invalid task status ${status}`);
    const result = this.database.prepare(`UPDATE tasks SET status=?,error=?,lease_token=NULL,lease_owner=NULL,lease_until=NULL
      WHERE run_id=? AND task_id=? AND EXISTS (SELECT 1 FROM runs WHERE id=? AND status IN ('running','recovering'))`)
      .run(status, error ? String(error.message ?? error) : null, runId, taskId, runId);
    if (!result.changes && !this.getRun(runId)?.tasks[taskId]) throw new Error(`Unknown task ${taskId} in run ${runId}`);
  }

  setRunStatus(runId, status, error = null) {
    const allowed = ['running','recovering','completed','failed','stopped'];
    if (!allowed.includes(status)) throw new TypeError(`Invalid run status ${status}`);
    const result = this.database.prepare("UPDATE runs SET status=?,error=?,updated_at=? WHERE id=? AND (status!='stopped' OR ?='stopped')")
      .run(status, error ? String(error.message ?? error) : null, new Date().toISOString(), runId, status);
    if (!result.changes && !this.getRun(runId)) throw new Error(`Unknown run ${runId}`);
  }

  resumeRun(runId, { workflow, digest, repoRoot }) {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Unknown run ${runId}`);
    if (run.status === 'running' || run.status === 'completed') throw new Error(`Run ${runId} cannot be resumed from ${run.status}`);
    if (run.digest !== digest || run.repoRoot !== repoRoot || JSON.stringify(run.workflow) !== JSON.stringify(workflow)) throw new Error('Resume contract does not match the persisted workflow');
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.prepare("UPDATE runs SET status='running',generation=generation+1,error=NULL,final_evidence=NULL,updated_at=? WHERE id=?").run(new Date().toISOString(), runId);
      this.database.prepare("UPDATE tasks SET status='queued',lease_token=NULL,lease_owner=NULL,lease_until=NULL WHERE run_id=? AND status IN ('running','stopped','failed')").run(runId);
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    return this.getRun(runId);
  }

  stop(runId) {
    const result = this.database.prepare(`UPDATE runs SET status='stopped', generation=generation+1, updated_at=?
      WHERE id=? AND status IN ('running','recovering')`).run(new Date().toISOString(), runId);
    if (!result.changes) {
      const existing = this.getRun(runId);
      if (!existing) throw new Error(`Unknown run ${runId}`);
      return existing;
    }
    this.database.prepare(`UPDATE tasks SET status='stopped', lease_token=NULL, lease_owner=NULL, lease_until=NULL
      WHERE run_id=? AND status IN ('queued','running')`).run(runId);
    return this.getRun(runId);
  }

  claimTask(runId, taskId, owner, leaseMs = DEFAULT_LEASE_MS) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const run = this.database.prepare('SELECT status,generation FROM runs WHERE id=?').get(runId);
      const task = this.database.prepare('SELECT status,attempt,lease_until FROM tasks WHERE run_id=? AND task_id=?').get(runId, taskId);
      if (!run || !task || !['running', 'recovering'].includes(run.status)) {
        this.database.exec('ROLLBACK');
        return null;
      }
      const expired = task.status === 'running' && task.lease_until <= Date.now();
      if (task.status !== 'queued' && !expired) {
        this.database.exec('ROLLBACK');
        return null;
      }
      const token = randomUUID();
      const attempt = task.attempt + 1;
      this.database.prepare(`UPDATE tasks SET status='running',attempt=?,lease_token=?,lease_owner=?,lease_until=?,error=NULL
        WHERE run_id=? AND task_id=?`).run(attempt, token, owner, Date.now() + leaseMs, runId, taskId);
      this.database.prepare("UPDATE runs SET status='running',updated_at=? WHERE id=? AND status='recovering'").run(new Date().toISOString(), runId);
      this.database.exec('COMMIT');
      return { runId, taskId, token, owner, attempt, generation: run.generation };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  completeTask(runId, taskId, token, result) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const run = this.database.prepare('SELECT status FROM runs WHERE id=?').get(runId);
      const task = this.database.prepare('SELECT lease_token,status FROM tasks WHERE run_id=? AND task_id=?').get(runId, taskId);
      if (!run || !['running', 'recovering'].includes(run.status) || !task || task.status !== 'running' || task.lease_token !== token) {
        this.database.exec('ROLLBACK');
        return false;
      }
      const updated = this.database.prepare(`UPDATE tasks SET status='completed',result=?,lease_token=NULL,lease_owner=NULL,lease_until=NULL
        WHERE run_id=? AND task_id=? AND lease_token=?`).run(JSON.stringify(result), runId, taskId, token);
      if (result.integrationHead) this.database.prepare('UPDATE runs SET integration_head=? WHERE id=?').run(result.integrationHead, runId);
      this.#refreshStatus(runId);
      this.database.exec('COMMIT');
      return updated.changes === 1;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  failTask(runId, taskId, token, error) {
    const updated = this.database.prepare(`UPDATE tasks SET status='failed',error=?,evidence=?,lease_token=NULL,lease_owner=NULL,lease_until=NULL
      WHERE run_id=? AND task_id=? AND status='running' AND lease_token=?`)
      .run(String(error?.message ?? error), error?.evidence ? JSON.stringify(error.evidence) : null, runId, taskId, token);
    this.#refreshStatus(runId);
    return updated.changes === 1;
  }

  reconcile(runId) {
    const run = this.database.prepare('SELECT status FROM runs WHERE id=?').get(runId);
    if (!run) throw new Error(`Unknown run ${runId}`);
    if (run.status === 'running') this.database.prepare(`UPDATE runs SET status='recovering',updated_at=? WHERE id=?`).run(new Date().toISOString(), runId);
    this.database.prepare(`UPDATE tasks SET status='queued',lease_token=NULL,lease_owner=NULL,lease_until=NULL
      WHERE run_id=? AND status='running' AND lease_until<=?`).run(runId, Date.now());
    return this.getRun(runId);
  }

  setFinalEvidence(runId, evidence) {
    this.database.prepare('UPDATE runs SET final_evidence=?,updated_at=? WHERE id=?')
      .run(JSON.stringify(evidence), new Date().toISOString(), runId);
  }

  sendMessage(runId, { fromTaskId, toTaskId, type, payload }) {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Unknown run ${runId}`);
    if (!run.tasks[fromTaskId] || (toTaskId && !run.tasks[toTaskId])) throw new Error('Message task ID is outside this run');
    if (typeof type !== 'string' || !type.trim()) throw new TypeError('Message type must be non-empty');
    const item = { id: randomUUID(), runId, fromTaskId, toTaskId: toTaskId ?? null, type, payload, createdAt: new Date().toISOString() };
    this.database.prepare(`INSERT INTO messages (id,run_id,from_task,to_task,type,payload,created_at) VALUES (?,?,?,?,?,?,?)`)
      .run(item.id, runId, fromTaskId, item.toTaskId, type, JSON.stringify(payload), item.createdAt);
    return item;
  }

  messages(runId) {
    if (!this.getRun(runId)) throw new Error(`Unknown run ${runId}`);
    return this.database.prepare('SELECT * FROM messages WHERE run_id=? ORDER BY created_at,rowid').all(runId)
      .map(row => ({ id: row.id, runId, fromTaskId: row.from_task, toTaskId: row.to_task, type: row.type, payload: JSON.parse(row.payload), createdAt: row.created_at }));
  }

  close() { this.database.close(); }

  #refreshStatus(runId) {
    const rows = this.database.prepare('SELECT status FROM tasks WHERE run_id=?').all(runId);
    const status = rows.some(row => row.status === 'failed') ? 'failed' : 'running';
    this.database.prepare('UPDATE runs SET status=?,updated_at=? WHERE id=? AND status != \'stopped\'')
      .run(status, new Date().toISOString(), runId);
  }

  #decodeRun(row, taskRows) {
    return {
      runId: row.id, label: row.label, workflow: JSON.parse(row.workflow), digest: row.digest,
      repoRoot: row.repo_root, roles: JSON.parse(row.roles), roleRevision: row.role_revision, integrationHead: row.integration_head, status: row.status,
      generation: row.generation, error: row.error, finalEvidence: row.final_evidence ? JSON.parse(row.final_evidence) : null, createdAt: row.created_at, updatedAt: row.updated_at,
      tasks: Object.fromEntries(taskRows.map(task => [task.task_id, {
        status: task.status, attempt: task.attempt, result: task.result ? JSON.parse(task.result) : null, error: task.error, evidence: task.evidence ? JSON.parse(task.evidence) : null
      }]))
    };
  }
}

function normalizeRoles(input) {
  const bindings = input?.roles && typeof input.roles === 'object' ? input.roles : Object.fromEntries(Object.entries(input ?? {}).filter(([key]) => key !== 'revision'));
  const revision = input?.revision ?? input?.roleRevision;
  const entries = Object.entries(bindings);
  if (!revision || !entries.length || entries.some(([key, value]) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127})?$/.test(key) || typeof value?.model !== 'string' || typeof value?.adapter !== 'string')) {
    throw new TypeError('Role configuration requires a revision and valid model profile bindings');
  }
  return { revision, bindings };
}

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

let _db: DB | null = null;

export function initDb(path: string): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      default_branch TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      watch_branch TEXT NOT NULL,
      watch_interval_sec INTEGER NOT NULL,
      auto_trigger TEXT NOT NULL,
      nodes_json TEXT NOT NULL,
      edges_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      telegram_approvals INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      trigger_sha TEXT NOT NULL,
      trigger_branch TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      log TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_builds_project_id ON builds(project_id);
    CREATE INDEX IF NOT EXISTS idx_builds_pipeline_id ON builds(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_builds_started_at ON builds(started_at DESC);

    CREATE TABLE IF NOT EXISTS poller_state (
      project_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      last_seen_sha TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (project_id, branch)
    );

    CREATE TABLE IF NOT EXISTS pipeline_last_build (
      pipeline_id TEXT PRIMARY KEY,
      last_built_sha TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS build_log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      build_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,
      node_id TEXT,
      step_type TEXT,
      message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_build_log_entries_build_id
      ON build_log_entries(build_id, id);

    CREATE TABLE IF NOT EXISTS build_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      build_id TEXT NOT NULL,
      path TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_build_artifacts_build_id
      ON build_artifacts(build_id);

    CREATE TABLE IF NOT EXISTS node_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      base_step_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Phase 4 Cluster A — generic poller scratchpad keyed by an opaque key.
    -- Used to track "last seen tag SHA per (pipeline,tag)" and "last cron
    -- minute fired per pipeline" without needing dedicated tables.
    CREATE TABLE IF NOT EXISTS poller_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Cluster 11.A — Auth, identity, audit. Tables exist on every install
    -- regardless of the auth.enabled flag so flipping the flag at runtime
    -- doesn't require a schema migration. Default config.auth.enabled is
    -- false, in which case the middleware skips enforcement entirely.
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      notification_prefs_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      request_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_ts ON audit_log(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
    CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource);

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      -- First 8 chars of the plaintext token, stored to help users
      -- identify which token is which without exposing the full secret.
      token_prefix TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_prefix ON api_tokens(token_prefix);

    -- Cluster 11.B — named secrets. The value column stores the AES-256-GCM
    -- envelope produced by crypto/secrets.encryptSecret. Names are unique
    -- and case-sensitive — the engine substitutes the secrets.NAME marker
    -- exactly. last_used_at tracks engine resolution so the UI can warn
    -- about stale entries.
    CREATE TABLE IF NOT EXISTS secrets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      encrypted_value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER
    );

    -- Cluster 11.B — encrypted file vault. encrypted_content stores the same
    -- AES-256-GCM envelope as secrets but base64-decoded into a BLOB cell
    -- (cheaper than re-base64-ing for every read). Hard-capped at 10 MiB
    -- per file via API validation.
    CREATE TABLE IF NOT EXISTS vault_files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      encrypted_content BLOB NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );

    -- Cluster 11.D - manual approval steps. One row per manualApproval
    -- node encountered by a running build. Persisted (not in-memory only)
    -- so a server restart while a build is awaiting approval recovers the
    -- pending state on next boot. decision is NULL until an approver
    -- decides or the timeout fires.
    CREATE TABLE IF NOT EXISTS build_approvals (
      id TEXT PRIMARY KEY,
      build_id TEXT NOT NULL,
      pipeline_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      message TEXT NOT NULL,
      inputs_spec_json TEXT NOT NULL,
      required_approvers INTEGER NOT NULL DEFAULT 1,
      required_roles_json TEXT NOT NULL DEFAULT '[]',
      timeout_minutes INTEGER NOT NULL DEFAULT 1440,
      requested_at INTEGER NOT NULL,
      decision TEXT,
      decided_by TEXT,
      decided_at INTEGER,
      inputs_values_json TEXT,
      approvers_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_build_approvals_build_id
      ON build_approvals(build_id);
    CREATE INDEX IF NOT EXISTS idx_build_approvals_pending
      ON build_approvals(decision, requested_at);
  `);

  // Lightweight migration for existing installs: SQLite's CREATE TABLE IF
  // NOT EXISTS doesn't add new columns, so additive schema changes need an
  // explicit ALTER. We swallow the error if the column already exists.
  const additivePipelineCols = [
    'telegram_approvals INTEGER NOT NULL DEFAULT 0',
    // Phase 4 Cluster A — extra trigger fields.
    'tag_pattern TEXT',
    'cron_expr TEXT',
    'path_filter TEXT',
    'cancel_in_progress_on_new_commit INTEGER NOT NULL DEFAULT 0',
    // Cluster 11.F — JSON array of test keys ("classname::name") the
    // user has marked as flaky / quarantined. Engine wiring (treat
    // failures from these as soft-fail) is a future step; the column
    // captures intent today so the UI roundtrips correctly.
    'flaky_quarantine_json TEXT',
  ];
  for (const decl of additivePipelineCols) {
    try {
      db.exec(`ALTER TABLE pipelines ADD COLUMN ${decl}`);
    } catch {
      /* column already present */
    }
  }

  _db = db;
  return db;
}

export function getDb(): DB {
  if (!_db) throw new Error('DB not initialized — call initDb() first');
  return _db;
}

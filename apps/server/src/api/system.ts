import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type {
  AiIntegrationProbeEntry,
  AiIntegrationsProbeResponse,
  AiToolBuiltin,
  SystemDiskUsage,
  SystemEncryptedField,
  SystemEncryptedFieldsResponse,
  SystemInfo,
  SystemMigrationLog,
  SystemPathEntry,
} from '@buildpilot/shared-types';
import { CONFIG_DIR } from '../paths';
import { getAiIntegrationsRuntime, getAuthConfigRuntime, loadConfig } from '../config';
import { SENSITIVE_FIELDS } from '../crypto/secrets';
import { getDb } from '../store/db';

// UI v2 Settings redesign — read-only endpoints that surface
// host/process information so the Settings page can render the
// General / Security / About / AI Integrations sections without each
// section reinventing the same probes.

// Hardcoded version + license. Bumped in lockstep with the root
// package.json. License is informational only — we don't enforce it.
const APP_VERSION = '0.1.0';
const LICENSE = 'Apache-2.0';

// Per-tool default invocation. Mirrors the DEFAULTS table in
// runner/steps/aiPrompt.ts. Repeated here so we can probe versions
// without importing runner-only modules into the API layer.
const TOOL_DEFAULTS: Record<AiToolBuiltin, string> = {
  claude: 'claude',
  codex: 'codex',
  aider: 'aider',
  gemini: 'gemini',
};

// SENSITIVE_FIELDS lives in crypto/secrets.ts as a `Set<string>` with no
// inherent ordering. The UI wants a stable list grouped by surface, so
// we hand-curate a `field → surfaces` mapping here. Fields that fall
// through to the default bucket are listed as "internal / various".
const FIELD_SURFACES: Record<string, string> = {
  botToken: 'telegram, telegramNotify, slack',
  signingSecret: 'webhooks (slack signature)',
  publicKey: 'webhooks (discord signature)',
  webhookUrl: 'slackNotify, discordNotify',
  password: 'sshRun, sshUpload, mysqldump, ftpUpload',
  accessKeyId: 's3Upload',
  secretAccessKey: 's3Upload',
  apiKeyId: 'iosASCSubmit',
  apiIssuerId: 'iosASCSubmit',
  appPassword: 'iosNotarize, iosDistribute',
  keychainPassword: 'iosImportCerts, iosUnlockKeychain',
  sentryAuthToken: 'sentryUploadDsyms',
  bugsnagApiKey: 'bugsnagUploadDsyms',
  smtpPassword: 'emailNotify',
  steamPassword: 'steamcmdLogin, steamcmdUpload',
  steamWebApiKey: 'steamGetItems',
  steamGuardCode: 'steamcmdLogin',
  ascPrivateKey: 'iosASCSubmit, iosTestFlight',
  ascApiKey: 'iosASCSubmit, iosTestFlight',
  apiKeyContents: 'iosNotarize',
  filePassword: 'iosImportCerts (p12 password)',
  firebaseToken: 'firebaseDistribute',
  datadogApiKey: 'dsymUpload (datadog)',
  instabugAppToken: 'dsymUpload (instabug)',
  embraceApiToken: 'dsymUpload (embrace)',
  newrelicAppToken: 'dsymUpload (newrelic)',
  playServiceAccountJson: 'playUpload',
  androidKeystorePassword: 'androidSign',
  androidKeyPassword: 'androidSign',
};

function safeStatBytes(path: string): { bytes: number; exists: boolean } {
  try {
    if (!existsSync(path)) return { bytes: 0, exists: false };
    const s = statSync(path);
    return { bytes: s.size, exists: true };
  } catch {
    return { bytes: 0, exists: false };
  }
}

// Read sqlite_version() via the live DB connection. Falls back to "n/a"
// if the DB hasn't been initialised yet (shouldn't happen — the system
// route only runs after initDb in index.ts — but defensive code costs
// nothing).
function readSqliteVersion(): string {
  try {
    const row = getDb()
      .prepare<unknown[], { v: string }>("SELECT sqlite_version() AS v")
      .get();
    return row?.v ?? 'n/a';
  } catch {
    return 'n/a';
  }
}

// Cache the probe results for 60s so spamming the Settings page doesn't
// fork the CLIs on every nav. The cache key is "all" — when any tool's
// override changes we'd invalidate, but since the cache window is short
// the worst case is a 60s wait for a fresh probe.
let probeCache: { at: number; data: AiIntegrationsProbeResponse } | null = null;
const PROBE_TTL_MS = 60_000;

async function probeAiTool(tool: AiToolBuiltin): Promise<AiIntegrationProbeEntry> {
  const override = getAiIntegrationsRuntime()[tool];
  const command =
    override?.path && override.path.length > 0 ? override.path : TOOL_DEFAULTS[tool];
  const model = override?.model ?? null;

  return new Promise<AiIntegrationProbeEntry>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (
      ok: boolean,
      version: string | null,
      error: string | null,
    ): void => {
      if (settled) return;
      settled = true;
      resolve({ tool, command, ok, version, model, error });
    };

    try {
      const child = spawn(command, ['--version'], {
        // shell:true on Windows so .cmd / .ps1 launchers resolve via
        // PATHEXT (matches the runner's spawn convention).
        shell: process.platform === 'win32',
        windowsHide: true,
      });

      const timeout = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        finish(false, null, 'timeout (2s)');
      }, 2000);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        finish(false, null, err.message);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        const combined = (stdout + '\n' + stderr).trim();
        // Match the first dotted version-ish token in the output. Most
        // CLIs print "<name> <version>" — we don't need to be strict.
        const match = combined.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][\w.]+)?)/);
        if (code === 0 && match) {
          finish(true, match[1] ?? null, null);
        } else if (code !== 0) {
          finish(false, null, `exit ${code} — ${combined.slice(0, 200)}`);
        } else {
          finish(false, null, `could not parse version from: ${combined.slice(0, 200)}`);
        }
      });
    } catch (err) {
      finish(false, null, err instanceof Error ? err.message : String(err));
    }
  });
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/system/info — server / runtime / paths in one shot. The
  // Settings page reads this for the General + About sections.
  app.get('/api/system/info', async (): Promise<SystemInfo> => {
    const cfg = loadConfig();
    const auth = getAuthConfigRuntime();
    const body: SystemInfo = {
      appVersion: APP_VERSION,
      nodeVersion: process.version,
      sqliteVersion: readSqliteVersion(),
      license: LICENSE,
      host: cfg.host,
      port: cfg.port,
      webOrigin: cfg.webOrigin,
      pollIntervalSec: cfg.pollIntervalSec,
      authEnabled: auth.enabled,
      configDir: CONFIG_DIR,
      configPath: join(CONFIG_DIR, 'config.json'),
      dbPath: cfg.dbPath,
      masterKeyPath: process.env.BUILDPILOT_MASTER_KEY_FILE ?? join(CONFIG_DIR, 'master.key'),
    };
    return body;
  });

  // GET /api/system/disk-usage — per-path size for the Paths group.
  // Artifact totals come from build_artifacts (sum of `size` column),
  // matching /api/metrics/disk-usage but in a leaner shape.
  app.get('/api/system/disk-usage', async (): Promise<SystemDiskUsage> => {
    const cfg = loadConfig();
    const configPath = join(CONFIG_DIR, 'config.json');
    const masterKeyPath =
      process.env.BUILDPILOT_MASTER_KEY_FILE ?? join(CONFIG_DIR, 'master.key');

    const db = safeStatBytes(cfg.dbPath);
    const config = safeStatBytes(configPath);
    const masterKey = safeStatBytes(masterKeyPath);

    // Artifacts total from the build_artifacts table. The actual files
    // live wherever the steps wrote them (next to each build's working
    // copy, typically), so we surface this as a logical total rather
    // than a single directory.
    let artifactBytes = 0;
    try {
      const r = getDb()
        .prepare<unknown[], { total: number | null }>(
          'SELECT COALESCE(SUM(size), 0) AS total FROM build_artifacts',
        )
        .get();
      artifactBytes = Number(r?.total ?? 0);
    } catch {
      // ignore — table may not exist on a fresh install
    }

    const entries: SystemPathEntry[] = [
      { label: 'Database', path: cfg.dbPath, bytes: db.bytes, exists: db.exists },
      { label: 'Config', path: configPath, bytes: config.bytes, exists: config.exists },
      {
        label: 'Master key',
        path: masterKeyPath,
        bytes: masterKey.bytes,
        exists: masterKey.exists,
      },
      {
        label: 'Artifacts (tracked)',
        // Not a single directory — files live alongside each build's
        // working copy. The Settings UI shows this differently.
        path: null,
        bytes: artifactBytes,
        exists: artifactBytes > 0,
      },
    ];

    return { entries };
  });

  // GET /api/system/encrypted-fields — list of field names that the
  // SENSITIVE_FIELDS sweep encrypts on read/write. The Settings →
  // Security tab renders this as a static table with a per-field
  // "surfaces" column (which step types touch it).
  app.get(
    '/api/system/encrypted-fields',
    async (): Promise<SystemEncryptedFieldsResponse> => {
      const fields: SystemEncryptedField[] = [...SENSITIVE_FIELDS]
        .map((field) => ({
          field,
          surfaces: FIELD_SURFACES[field] ?? 'internal / various',
        }))
        .sort((a, b) => a.field.localeCompare(b.field));
      return { fields, envelope: 'enc:1:' };
    },
  );

  // GET /api/system/migration-log — encryption migration sweep events.
  // The current implementation in crypto/migrateSecrets.ts logs once
  // per server start but doesn't persist; we return an empty list with
  // a note so the UI can show "(history not yet persisted)" instead of
  // pretending to have data.
  app.get('/api/system/migration-log', async (): Promise<SystemMigrationLog> => {
    return {
      events: [],
      note:
        'Migration sweep runs at every server start and is idempotent. ' +
        'Persistent history will be added when the audit log gains a dedicated migration channel.',
    };
  });

  // POST /api/config/ai-integrations/probe — probes the four built-in
  // CLIs with `--version`, returns a per-tool { ok, version, error }
  // entry. Results are cached for 60s so back-and-forth navigation
  // doesn't re-fork the CLIs.
  //
  // POST (not GET) because spawning processes is side-effect-ish — we
  // don't want it cached by intermediate proxies, and GETs sometimes
  // get prefetched by browsers.
  app.post(
    '/api/config/ai-integrations/probe',
    async (): Promise<AiIntegrationsProbeResponse> => {
      if (probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) {
        return probeCache.data;
      }
      const tools: AiToolBuiltin[] = ['claude', 'codex', 'aider', 'gemini'];
      const results = await Promise.all(tools.map((t) => probeAiTool(t)));
      const body: AiIntegrationsProbeResponse = { results };
      probeCache = { at: Date.now(), data: body };
      return body;
    },
  );
}

// Test-only helper: lets the test suite invalidate the cache between
// runs so probe assertions aren't polluted by previous tests.
export function _clearProbeCacheForTests(): void {
  probeCache = null;
}

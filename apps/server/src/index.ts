import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig, persistPort } from './config';
import { logger } from './logger';
import { initDb } from './store/db';
import { projectsRoutes } from './api/projects';
import { projectExportRoutes } from './api/projectExport';
import { pipelinesRoutes } from './api/pipelines';
import { buildsRoutes } from './api/builds';
import { eventsRoutes } from './api/events';
import { nodeTemplatesRoutes } from './api/nodeTemplates';
import { hostsRoutes } from './api/hosts';
import { triggerRoutes } from './api/triggers';
import { configRoutes } from './api/config';
import { metricsRoutes } from './api/metrics';
import { testReportsRoutes } from './api/test-reports';
import { annotationsRoutes } from './api/annotations';
import { systemRoutes } from './api/system';
import { flakyTestsRoutes } from './api/flaky-tests';
import { secretsRoutes } from './api/secrets';
import { vaultFilesRoutes } from './api/vault-files';
import { vcsRoutes } from './api/vcs';
import { prContextRoutes } from './api/pr-context';
import { prCommandRoutes } from './api/pr-commands';
import { approvalsRoutes } from './api/approvals';
import { lanesRoutes } from './api/lanes';
import { queueRoutes } from './api/queue';
import { reloadSchedules, startPoller } from './poller';
import { eventBus } from './events/bus';
import { startTelegramBot } from './runner/telegramBot';
import { registerSlackParser, slackBotRoutes } from './slack-bot';
import { discordBotRoutes } from './discord-bot';
import { testNotifyRoutes } from './api/test-notify';
import { initScheduler } from './runner/coordinator';
import { migratePlaintextSecrets } from './crypto/migrateSecrets';
import { migrateHostsFile } from './store/hosts';
import { pruneOldBuilds } from './store/retention';
import { authRoutes } from './api/auth';
import { usersRoutes } from './api/users';
import { auditLogRoutes } from './api/audit-log';
import { apiTokensRoutes } from './api/api-tokens';
import { registerSessionMiddleware, pruneExpiredSessions } from './auth/sessions';
import { registerAuditHook } from './audit';
import { registerWebStatic } from './static-web';

// How many ports past the configured one we're willing to try before giving up.
const PORT_FALLBACK_ATTEMPTS = 20;

// Windows (Hyper-V / WinNAT / WSL) reserves blocks of TCP ports; binding inside
// one fails with EACCES even though no process holds the port. The reserved
// blocks are per-machine and move across reboots, so no hardcoded default is
// safe — BuildPilot has already had two defaults swallowed this way, each time
// leaving the server unable to start at all.
//
// Rather than hunt for another "safe" constant, walk forward from the configured
// port until one binds, then persist the winner so the desktop apps and the web
// proxy (which read host/port out of config.json) follow us there. EADDRINUSE is
// treated the same way: a second instance quietly takes the next free port.
async function bindWithFallback(
  app: { listen(opts: { host: string; port: number }): Promise<unknown> },
  host: string,
  configuredPort: number,
): Promise<number> {
  for (let offset = 0; offset < PORT_FALLBACK_ATTEMPTS; offset++) {
    const port = configuredPort + offset;
    try {
      await app.listen({ host, port });
      if (port !== configuredPort) {
        logger.warn(
          { configuredPort, port },
          `port ${configuredPort} is unavailable (reserved by the OS or already in use) — ` +
            `bound to ${port} instead and updated config.json so clients follow`,
        );
        persistPort(port);
      }
      return port;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EACCES' && code !== 'EADDRINUSE') throw err;
      logger.debug({ port, code }, 'port unavailable, trying the next one');
    }
  }
  throw new Error(
    `Could not bind any port in ${configuredPort}–${configuredPort + PORT_FALLBACK_ATTEMPTS - 1} ` +
      `on ${host}. On Windows, check reserved ranges with ` +
      `"netsh interface ipv4 show excludedportrange protocol=tcp" and set a port ` +
      `outside them in ~/.buildpilot/config.json.`,
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  initDb(config.dbPath);
  migratePlaintextSecrets();
  migrateHostsFile();
  // WP3 (queue): fail orphaned 'running' rows from a previous process and
  // kick each lane so pending rows that survived the restart get scheduled.
  initScheduler();

  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname,req,res,reqId,responseTime',
          messageFormat: '{msg}',
        },
      },
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  const allowedOrigins = new Set<string>();
  if (config.webOrigin) {
    allowedOrigins.add(config.webOrigin);
    // The dev server answers on both 127.0.0.1 and localhost, and the browser
    // sends back whichever the user typed. Derive that alias from webOrigin
    // instead of hardcoding the port — the default has already moved twice, and
    // a stale literal here silently breaks CORS in dev.
    try {
      const url = new URL(config.webOrigin);
      const alias = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      allowedOrigins.add(`${url.protocol}//${alias}${url.port ? `:${url.port}` : ''}`);
    } catch {
      // Malformed webOrigin — the exact value above still works, just no alias.
    }
  }

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins.has(origin));
    },
    // Cluster 11.A — credentials must be true so the session cookie
    // round-trips between the Vite dev server (35701) and the API
    // (35700). When auth is disabled the cookie isn't set, so this is
    // a no-op for default installs.
    credentials: true,
  });

  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));

  // Slack delivers x-www-form-urlencoded; register the raw-preserving
  // parser before the routes so signature verification can read the body.
  registerSlackParser(app);

  // Cluster 11.A — session/bearer auth + audit hooks. Both hooks are
  // registered unconditionally so flipping `auth.enabled` at runtime
  // (between server restarts) doesn't need a code change.
  await registerSessionMiddleware(app);
  await registerAuditHook(app);

  await authRoutes(app);
  await usersRoutes(app);
  await auditLogRoutes(app);
  await apiTokensRoutes(app);

  await projectsRoutes(app);
  await projectExportRoutes(app);
  await pipelinesRoutes(app);
  await buildsRoutes(app);
  await eventsRoutes(app);
  await nodeTemplatesRoutes(app);
  await hostsRoutes(app);
  await triggerRoutes(app);
  await configRoutes(app);
  await metricsRoutes(app);
  await slackBotRoutes(app);
  await discordBotRoutes(app);
  await testNotifyRoutes(app);
  await testReportsRoutes(app);
  await annotationsRoutes(app);
  await systemRoutes(app);
  await flakyTestsRoutes(app);
  await secretsRoutes(app);
  await vaultFilesRoutes(app);
  await vcsRoutes(app);
  await prContextRoutes(app);
  await prCommandRoutes(app);
  await approvalsRoutes(app);
  await lanesRoutes(app);
  await queueRoutes(app);

  // Serve the built web SPA from this origin (production / desktop). No-op
  // in dev where Vite owns the web on 35701. Registered last so all /api and
  // /events routes take precedence over the static wildcard + SPA fallback.
  await registerWebStatic(app);

  // Re-sync poller whenever projects change. Pipeline mutations also trigger sync;
  // for now we just sync on any project event and rely on listPipelines() returning
  // the current set on the next tick.
  eventBus.subscribe((e) => {
    if (
      e.type === 'projectAdded' ||
      e.type === 'projectRemoved' ||
      e.type === 'pipelineChanged'
    ) {
      reloadSchedules();
    }
  });

  const boundPort = await bindWithFallback(app, config.host, config.port);
  logger.info({ host: config.host, port: boundPort }, 'BuildPilot server listening');

  // Security guardrail: the default install binds loopback with auth off,
  // which is safe. But if someone widens the bind (e.g. host "0.0.0.0" to
  // reach the dashboard from another machine) WITHOUT turning auth on, the
  // dashboard and the entire API are reachable on the network with no
  // credentials. Warn loudly at startup — we don't change the bind or any
  // default, just make the exposure impossible to miss in the logs.
  const isLoopbackHost = (h: string): boolean => {
    const host = h.trim().toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      // IPv4 loopback block 127.0.0.0/8.
      host.startsWith('127.')
    );
  };
  // `auth` is optional on the type but always backfilled by loadConfig();
  // `?.enabled` keeps this type-safe and still warns if the block is absent
  // (absent === auth not enforced).
  if (!isLoopbackHost(config.host) && !config.auth?.enabled) {
    logger.warn(
      { host: config.host, port: boundPort },
      'SECURITY: server is bound to a non-loopback address with auth DISABLED — ' +
        'the dashboard and API are reachable on the network WITHOUT credentials. ' +
        'Enable auth (config.json → auth.enabled) or bind to 127.0.0.1.',
    );
  }

  startPoller();
  if (config.telegram) startTelegramBot(config.telegram);

  // Cluster 11.A — daily sweep to delete expired session rows. The
  // middleware deletes them lazily on touch too; this just keeps the
  // table tidy on long-running installs.
  pruneExpiredSessions();
  setInterval(() => pruneExpiredSessions(), 24 * 60 * 60 * 1000);

  // Phase 4 Cluster D — daily build retention sweep. Opt-in via
  // `buildRetentionDays` in config.json. The sweep runs immediately on boot
  // and then every 24h while the server is up.
  if (config.buildRetentionDays && config.buildRetentionDays > 0) {
    const retentionDays = config.buildRetentionDays;
    const runSweep = () => {
      try {
        const stats = pruneOldBuilds(retentionDays);
        if (stats.builds > 0) {
          logger.info(
            {
              retentionDays,
              builds: stats.builds,
              logEntries: stats.logEntries,
              artifacts: stats.artifacts,
            },
            'retention: pruned builds older than cutoff',
          );
        }
      } catch (err) {
        logger.warn({ err: String(err) }, 'retention sweep failed');
      }
    };
    runSweep();
    setInterval(runSweep, 24 * 60 * 60 * 1000);
  }
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});

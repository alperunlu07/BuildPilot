import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config';
import { logger } from './logger';
import { initDb } from './store/db';
import { projectsRoutes } from './api/projects';
import { pipelinesRoutes } from './api/pipelines';
import { buildsRoutes } from './api/builds';
import { eventsRoutes } from './api/events';
import { nodeTemplatesRoutes } from './api/nodeTemplates';
import { hostsRoutes } from './api/hosts';
import { triggerRoutes } from './api/triggers';
import { configRoutes } from './api/config';
import { metricsRoutes } from './api/metrics';
import { testReportsRoutes } from './api/test-reports';
import { flakyTestsRoutes } from './api/flaky-tests';
import { reloadSchedules, startPoller } from './poller';
import { eventBus } from './events/bus';
import { startTelegramBot } from './runner/telegramBot';
import { registerSlackParser, slackBotRoutes } from './slack-bot';
import { discordBotRoutes } from './discord-bot';
import { testNotifyRoutes } from './api/test-notify';
import { migratePlaintextSecrets } from './crypto/migrateSecrets';
import { migrateHostsFile } from './store/hosts';
import { pruneOldBuilds } from './store/retention';
import { authRoutes } from './api/auth';
import { usersRoutes } from './api/users';
import { auditLogRoutes } from './api/audit-log';
import { apiTokensRoutes } from './api/api-tokens';
import { registerSessionMiddleware, pruneExpiredSessions } from './auth/sessions';
import { registerAuditHook } from './audit';

async function main(): Promise<void> {
  const config = loadConfig();
  initDb(config.dbPath);
  migratePlaintextSecrets();
  migrateHostsFile();

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
  if (config.webOrigin) allowedOrigins.add(config.webOrigin);
  allowedOrigins.add('http://127.0.0.1:51732');
  allowedOrigins.add('http://localhost:51732');

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins.has(origin));
    },
    // Cluster 11.A — credentials must be true so the session cookie
    // round-trips between the Vite dev server (51732) and the API
    // (51731). When auth is disabled the cookie isn't set, so this is
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
  await flakyTestsRoutes(app);

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

  await app.listen({ host: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, 'BuildPilot server listening');

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

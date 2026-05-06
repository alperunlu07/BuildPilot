import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config';
import { logger } from './logger';
import { initDb } from './store/db';
import { projectsRoutes } from './api/projects';
import { pipelinesRoutes } from './api/pipelines';
import { buildsRoutes } from './api/builds';
import { eventsRoutes } from './api/events';
import { reloadSchedules, startPoller } from './poller';
import { eventBus } from './events/bus';

async function main(): Promise<void> {
  const config = loadConfig();
  initDb(config.dbPath);

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
  allowedOrigins.add('http://127.0.0.1:49832');
  allowedOrigins.add('http://localhost:49832');

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, allowedOrigins.has(origin));
    },
    credentials: false,
  });

  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));

  await projectsRoutes(app);
  await pipelinesRoutes(app);
  await buildsRoutes(app);
  await eventsRoutes(app);

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
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});

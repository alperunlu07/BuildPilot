import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { logger } from './logger';

// Resolve the built web bundle (`apps/web/dist`). In a dev checkout the
// server runs from `apps/server/src` via tsx, so the bundle sits two levels
// up under `web/dist`. A packaged desktop build ships the bundle elsewhere
// and points us at it via BUILDPILOT_WEB_DIST.
function resolveWebDist(): string | null {
  const fromEnv = process.env.BUILDPILOT_WEB_DIST;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;

  // When this module is bundled to CommonJS (packaged desktop build),
  // `import.meta.url` is empty — but that build always sets BUILDPILOT_WEB_DIST
  // above, so we never rely on the relative guess there.
  if (!import.meta.url) return null;
  const here = dirname(fileURLToPath(import.meta.url));
  const guess = join(here, '..', '..', 'web', 'dist');
  return existsSync(join(guess, 'index.html')) ? guess : null;
}

// Serve the SPA from the same origin as the API so the desktop window (and a
// plain browser) can load the whole app from the server port — no Vite dev
// server required in production. Falls back to index.html for client-side
// routes (e.g. /projects, /builds/123) while leaving /api and /events to the
// real handlers. A no-op when no build is present (normal during `pnpm dev`,
// where Vite serves the web on 51732 and proxies the API here).
export async function registerWebStatic(app: FastifyInstance): Promise<void> {
  const dist = resolveWebDist();
  if (!dist) {
    logger.info('web bundle not found — skipping static serving (dev mode?)');
    return;
  }

  await app.register(fastifyStatic, { root: dist, wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    if (
      req.method === 'GET' &&
      !req.url.startsWith('/api') &&
      !req.url.startsWith('/events')
    ) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });

  logger.info({ dist }, 'serving web bundle');
}

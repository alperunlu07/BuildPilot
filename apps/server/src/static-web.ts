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
  // A directory only counts as a usable bundle if it actually contains
  // index.html — checked identically for both the env override and the
  // relative dev guess, so an empty/wrong BUILDPILOT_WEB_DIST is rejected
  // rather than registering a handler that 404s every route.
  const hasIndex = (dir: string): string | null =>
    existsSync(join(dir, 'index.html')) ? dir : null;

  const fromEnv = process.env.BUILDPILOT_WEB_DIST;
  if (fromEnv) return hasIndex(fromEnv);

  // When this module is bundled to CommonJS (packaged desktop build),
  // `import.meta.url` is empty — but that build always sets BUILDPILOT_WEB_DIST
  // above, so we never rely on the relative guess there.
  if (!import.meta.url) return null;
  const here = dirname(fileURLToPath(import.meta.url));
  return hasIndex(join(here, '..', '..', 'web', 'dist'));
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

  await app.register(fastifyStatic, {
    root: dist,
    wildcard: false,
    // Take full control of Cache-Control via setHeaders below. Without this,
    // @fastify/static's own cacheControl default stamps `public, max-age=0` on
    // every file AFTER our hook, clobbering the per-file policy.
    cacheControl: false,
    // Per-file cache policy. Content-hashed assets under /assets/ are safe to
    // cache forever — a new build emits new filenames, so the URL itself busts
    // the cache. Everything else (the unhashed index.html shell, the service
    // worker sw.js, the web manifest and root icons) must stay revalidated so a
    // freshly installed desktop build is picked up immediately rather than
    // pinned to a stale shell/worker.
    setHeaders: (res, filePath) => {
      const hashedAsset = /[\\/]assets[\\/]/.test(filePath);
      res.setHeader(
        'Cache-Control',
        hashedAsset
          ? 'public, max-age=31536000, immutable'
          : 'no-cache, must-revalidate',
      );
    },
  });

  app.setNotFoundHandler((req, reply) => {
    // Serve the SPA shell for client-side routes. Anchor the prefixes on a
    // path boundary so a client route like `/api-tokens` isn't mistaken for an
    // API call (a bare startsWith('/api') would swallow it). HEAD mirrors GET
    // so probes/bots see the same status as a browser navigation.
    const path = req.url.split('?')[0] ?? req.url;
    const isApi = path === '/api' || path.startsWith('/api/');
    const isEvents = path === '/events' || path.startsWith('/events/');
    if ((req.method === 'GET' || req.method === 'HEAD') && !isApi && !isEvents) {
      // The fallback shell is index.html, so the setHeaders policy above sends
      // it `no-cache, must-revalidate` — a new build is never pinned.
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not found' });
  });

  logger.info({ dist }, 'serving web bundle');
}

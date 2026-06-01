// Bundle the Fastify server into a single CommonJS file for the packaged
// desktop app. Native and worker-thread-based modules are kept external —
// they can't be inlined — and are shipped as real node_modules alongside the
// bundle (see electron-builder.yml `extraResources`). See docs/DESKTOP.md for
// the production native-rebuild caveat (better-sqlite3 must match Electron's
// ABI under ELECTRON_RUN_AS_NODE).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const entry = join(repoRoot, 'apps', 'server', 'src', 'index.ts');
const outfile = join(here, '..', 'server', 'index.cjs');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  // Native addons (better-sqlite3, ssh2) and modules that spawn worker
  // threads / load files at runtime (pino) can't be inlined.
  external: [
    'better-sqlite3',
    'ssh2',
    'pino',
    'pino-pretty',
    'thread-stream',
    'fastify',
    '@fastify/static',
    '@fastify/cors',
    '@aws-sdk/client-s3',
    '@aws-sdk/lib-storage',
    '@aws-sdk/s3-request-presigner',
  ],
  logLevel: 'info',
});

console.log(`Bundled server → ${outfile}`);

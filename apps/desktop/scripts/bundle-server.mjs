// Bundle the Fastify server into a single CommonJS file for the packaged
// desktop app. Native and worker-thread-based modules are kept external —
// they can't be inlined — and are shipped as real node_modules alongside the
// bundle (see electron-builder.yml `extraResources`). See docs/DESKTOP.md for
// the production native-rebuild caveat (better-sqlite3 must match Electron's
// ABI under ELECTRON_RUN_AS_NODE).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SERVER_EXTERNALS } from './server-externals.mjs';

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
  // Everything pure-JS is inlined; only native addons + the pino worker
  // family stay external and ship as real node_modules (see server-externals.mjs).
  external: SERVER_EXTERNALS,
  logLevel: 'info',
});

console.log(`Bundled server → ${outfile}`);

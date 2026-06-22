// Bundle the Fastify server into a single CommonJS file for the packaged Tauri
// desktop app. Native and worker-thread-based modules are kept external — they
// can't be inlined — and are shipped as real node_modules alongside the bundle
// (see prepare-resources.mjs + tauri.conf.json `bundle.resources`).
//
// Unlike the Electron build, the packaged server runs under a REAL Node runtime
// (a shipped `runtime/node`, or the system `node`), not Electron's embedded
// Node — so there's no ELECTRON_RUN_AS_NODE and no Electron-ABI rebuild. The
// esbuild target therefore tracks the Node we expect to run with.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SERVER_EXTERNALS } from './server-externals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const tauriDir = join(here, '..');
const entry = join(repoRoot, 'apps', 'server', 'src', 'index.ts');
const outfile = join(tauriDir, 'src-tauri', 'resources', 'server', 'index.cjs');

// The bundle runs under a real Node (Node 20+ LTS). node20 output runs cleanly
// on Node 20 and 22; bump this when the shipped/expected runtime moves on.
const target = 'node20';
console.log(`esbuild target: ${target}`);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  target,
  format: 'cjs',
  sourcemap: true,
  // Everything pure-JS is inlined; only native addons + the pino worker family
  // stay external and ship as real node_modules (see server-externals.mjs).
  external: SERVER_EXTERNALS,
  logLevel: 'info',
});

console.log(`Bundled server → ${outfile}`);

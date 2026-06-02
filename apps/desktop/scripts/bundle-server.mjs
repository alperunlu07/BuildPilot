// Bundle the Fastify server into a single CommonJS file for the packaged
// desktop app. Native and worker-thread-based modules are kept external —
// they can't be inlined — and are shipped as real node_modules alongside the
// bundle (see electron-builder.yml `extraResources`). See docs/DESKTOP.md for
// the production native-rebuild caveat (better-sqlite3 must match Electron's
// ABI under ELECTRON_RUN_AS_NODE).
import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SERVER_EXTERNALS } from './server-externals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const desktopDir = join(here, '..');
const entry = join(repoRoot, 'apps', 'server', 'src', 'index.ts');
const outfile = join(desktopDir, 'server', 'index.cjs');

// The bundle runs under Electron's embedded Node (ELECTRON_RUN_AS_NODE), so the
// esbuild `target` must track THAT Node — not the build machine's. Hardcoding
// it means an Electron bump that raises the Node major silently down-levels the
// output. Derive it from the installed electron version instead, via the
// well-known Electron-major → Node-major table, and warn-and-fall-back to a
// documented default if we hit an Electron we don't have mapped yet.
const ELECTRON_NODE_MAJOR = {
  31: 20,
  32: 20,
  33: 20, // current (package.json: electron ^33) — matches the old hardcoded node20
  34: 20,
  35: 22,
  36: 22,
};
const FALLBACK_NODE_MAJOR = 20; // keep in sync with apps/desktop devDep `electron`

function resolveNodeTarget() {
  const electronPkgPath = join(desktopDir, 'node_modules', 'electron', 'package.json');
  if (!existsSync(electronPkgPath)) {
    console.warn(
      `⚠  electron not installed — defaulting esbuild target to node${FALLBACK_NODE_MAJOR}. ` +
        'Run `pnpm install` in apps/desktop so the target tracks Electron.',
    );
    return FALLBACK_NODE_MAJOR;
  }
  const electronVersion = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version;
  const electronMajor = Number.parseInt(electronVersion, 10);
  const nodeMajor = ELECTRON_NODE_MAJOR[electronMajor];
  if (nodeMajor == null) {
    console.warn(
      `⚠  no Node mapping for Electron ${electronVersion} — defaulting esbuild target to ` +
        `node${FALLBACK_NODE_MAJOR}. Add Electron ${electronMajor} to ELECTRON_NODE_MAJOR in ` +
        'scripts/bundle-server.mjs (see https://www.electronjs.org/docs/latest/tutorial/electron-timelines).',
    );
    return FALLBACK_NODE_MAJOR;
  }
  return nodeMajor;
}

const target = `node${resolveNodeTarget()}`;
console.log(`esbuild target: ${target}`);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  target,
  format: 'cjs',
  sourcemap: true,
  // Everything pure-JS is inlined; only native addons + the pino worker
  // family stay external and ship as real node_modules (see server-externals.mjs).
  external: SERVER_EXTERNALS,
  logLevel: 'info',
});

console.log(`Bundled server → ${outfile}`);

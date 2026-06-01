// Prepare the self-contained server runtime that ships inside the packaged
// app, so the target PC needs NO Node / npm / build tools installed.
//
// What it does, in order:
//   1. Reads the external runtime deps (native addons + pino family) and their
//      pinned versions from apps/server/package.json.
//   2. Writes apps/desktop/server/package.json and `npm install`s just those
//      (plus their transitive deps) into apps/desktop/server/node_modules.
//   3. Rebuilds the native addons (better-sqlite3, ssh2) against Electron's
//      Node ABI via @electron/rebuild — required because the packaged server
//      runs under ELECTRON_RUN_AS_NODE (Electron's bundled Node, not system).
//
// Build-machine prerequisites: Node + npm, plus a C/C++ toolchain + Python for
// the native rebuild (Visual Studio Build Tools on Windows, Xcode CLT on mac).
// The PRODUCED installer has no such requirements.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NATIVE_EXTERNALS, SERVER_EXTERNALS } from './server-externals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, '..');
const repoRoot = join(desktopDir, '..', '..');
const serverDir = join(desktopDir, 'server');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(' ')}  (cwd: ${cwd})`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

// 1. Resolve pinned versions from the server package.
const serverPkg = JSON.parse(
  readFileSync(join(repoRoot, 'apps', 'server', 'package.json'), 'utf8'),
);
const dependencies = {};
for (const name of SERVER_EXTERNALS) {
  const version = serverPkg.dependencies?.[name];
  if (!version) {
    throw new Error(
      `"${name}" is listed as an external but isn't a dependency of @buildpilot/server`,
    );
  }
  dependencies[name] = version;
}

// 2. Fresh, isolated install (no workspace symlinks) so the shipped tree is
//    self-contained and copy-safe.
mkdirSync(serverDir, { recursive: true });
rmSync(join(serverDir, 'node_modules'), { recursive: true, force: true });
writeFileSync(
  join(serverDir, 'package.json'),
  JSON.stringify(
    {
      name: 'buildpilot-server-runtime',
      private: true,
      version: serverPkg.version ?? '0.0.0',
      dependencies,
    },
    null,
    2,
  ),
);
run(
  npmCmd,
  ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock'],
  serverDir,
);

// 3. Rebuild native addons for Electron's ABI.
const electronPkgPath = join(desktopDir, 'node_modules', 'electron', 'package.json');
if (!existsSync(electronPkgPath)) {
  console.warn(
    '\n⚠  electron is not installed — skipping native rebuild. Run `pnpm install` ' +
      'in apps/desktop, then re-run this script before packaging.',
  );
  process.exit(0);
}
const electronVersion = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version;

const rebuildBin = join(
  desktopDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild',
);
const rebuildArgs = [
  '--version',
  electronVersion,
  '--module-dir',
  serverDir,
  '--only',
  NATIVE_EXTERNALS.join(','),
];
if (existsSync(rebuildBin)) {
  run(rebuildBin, rebuildArgs, serverDir);
} else {
  // Fall back to npx if @electron/rebuild wasn't hoisted to desktop's bin.
  run(npmCmd.replace(/npm(\.cmd)?$/, 'npx$1'), ['@electron/rebuild', ...rebuildArgs], serverDir);
}

console.log('\n✓ Server runtime prepared at apps/desktop/server (bundle + node_modules).');

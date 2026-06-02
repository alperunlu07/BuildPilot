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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NATIVE_EXTERNALS, SERVER_EXTERNALS } from './server-externals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, '..');
const repoRoot = join(desktopDir, '..', '..');
const serverDir = join(desktopDir, 'server');

const exe = process.platform === 'win32' ? '.cmd' : '';
const npmCmd = `npm${exe}`;
const npxCmd = `npx${exe}`;

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(' ')}  (cwd: ${cwd})`);
  // On Windows, modern Node refuses to spawn a .cmd/.bat shim (npm.cmd,
  // npx.cmd, electron-rebuild.cmd) without shell:true — it throws EINVAL
  // (the same fix applied to the dev server spawn in src/server.ts). Run
  // those through the shell and quote the command + any args containing
  // spaces so paths like "C:\Program Files\…" survive. Real executables
  // (POSIX npm/npx, or .exe) spawn directly as before.
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
  const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
  execFileSync(
    useShell ? quote(cmd) : cmd,
    useShell ? args.map(quote) : args,
    { cwd, stdio: 'inherit', shell: useShell },
  );
}

// 1. Resolve the EXACT installed version of each external from the server's
//    real node_modules (not the semver range in its package.json). Installing
//    against a range with `--no-package-lock` lets the shipped tree drift
//    between builds (e.g. a patch bump publishes upstream); pinning the exact
//    version already on disk makes the synthetic install reproducible against
//    the committed pnpm-lock that produced apps/server/node_modules.
const serverPkg = JSON.parse(
  readFileSync(join(repoRoot, 'apps', 'server', 'package.json'), 'utf8'),
);
// Resolve deps from the server package's context — under pnpm they live in
// apps/server/node_modules (symlinked into the store), not the repo root.
const serverRequire = createRequire(join(repoRoot, 'apps', 'server', 'package.json'));
const dependencies = {};
for (const name of SERVER_EXTERNALS) {
  // The range must still be declared — that's what the drift guard and the
  // server itself rely on; its absence means server-externals.mjs is stale.
  if (!serverPkg.dependencies?.[name]) {
    throw new Error(
      `"${name}" is listed as an external but isn't a dependency of @buildpilot/server`,
    );
  }
  // Read the version actually installed in apps/server/node_modules so the
  // pin matches what the repo's lockfile resolved, byte-for-byte.
  let installedPkgPath;
  try {
    installedPkgPath = serverRequire.resolve(`${name}/package.json`);
  } catch {
    throw new Error(
      `"${name}" is a declared dependency of @buildpilot/server but isn't installed in ` +
        `apps/server/node_modules — run \`pnpm install\` at the repo root first.`,
    );
  }
  dependencies[name] = JSON.parse(readFileSync(installedPkgPath, 'utf8')).version;
}

// 1b. Drift guard: a server dep that ships a native addon (binding.gyp /
// "gypfile" / a node-gyp/prebuild install script) but ISN'T in SERVER_EXTERNALS
// would be silently inlined by esbuild and crash at runtime in the packaged
// app. Catch it at build time instead. (Pure-JS deps are meant to be bundled.)
const externalSet = new Set(SERVER_EXTERNALS);
const nativeMissing = [];
for (const name of Object.keys(serverPkg.dependencies ?? {})) {
  if (externalSet.has(name)) continue;
  let depPkgPath;
  try {
    depPkgPath = serverRequire.resolve(`${name}/package.json`);
  } catch {
    continue; // not resolvable — skip
  }
  const depPkg = JSON.parse(readFileSync(depPkgPath, 'utf8'));
  const installScript = `${depPkg.scripts?.install ?? ''} ${depPkg.scripts?.preinstall ?? ''}`;
  const looksNative =
    depPkg.gypfile === true ||
    depPkg.binary != null ||
    /node-gyp|prebuild|cmake-js|node-pre-gyp/.test(installScript) ||
    existsSync(join(dirname(depPkgPath), 'binding.gyp'));
  if (looksNative) nativeMissing.push(name);
}
if (nativeMissing.length > 0) {
  throw new Error(
    `These server deps look native but are missing from SERVER_EXTERNALS ` +
      `(esbuild would inline them and the packaged app would crash at runtime): ` +
      `${nativeMissing.join(', ')}. Add them to apps/desktop/scripts/server-externals.mjs ` +
      `(and NATIVE_EXTERNALS if they ship a .node binary).`,
  );
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

const rebuildBin = join(desktopDir, 'node_modules', '.bin', `electron-rebuild${exe}`);
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
  run(npxCmd, ['@electron/rebuild', ...rebuildArgs], serverDir);
}

console.log('\n✓ Server runtime prepared at apps/desktop/server (bundle + node_modules).');

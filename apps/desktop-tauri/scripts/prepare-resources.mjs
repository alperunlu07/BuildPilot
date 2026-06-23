// Prepare the self-contained server runtime that ships inside the packaged
// Tauri app: the esbuild bundle (written by bundle-server.mjs) plus the
// installed node_modules for the external runtime deps (native addons + the
// pino family) that can't be inlined.
//
// What it does, in order:
//   1. Reads the external runtime deps and their EXACT installed versions from
//      apps/server's real node_modules (so the shipped tree is reproducible).
//   2. Writes src-tauri/resources/server/package.json and `npm install`s just
//      those (plus transitive deps) into resources/server/node_modules.
//
// Unlike the Electron build there is NO @electron/rebuild step: the packaged
// server runs under a real Node runtime (a shipped `runtime/node`, or the
// system `node`), so the native addons are built for ordinary Node's ABI by the
// install itself. Ship a Node whose major matches the build machine's (or rely
// on a same-major system Node) so the prebuilt .node binaries load.
//
// Build-machine prerequisites: Node + npm, plus a C/C++ toolchain + Python for
// any native addon that builds from source.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SERVER_EXTERNALS } from './server-externals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tauriDir = join(here, '..');
const repoRoot = join(tauriDir, '..', '..');
const serverDir = join(tauriDir, 'src-tauri', 'resources', 'server');
const webDir = join(tauriDir, 'src-tauri', 'resources', 'web', 'dist');

const exe = process.platform === 'win32' ? '.cmd' : '';
const npmCmd = `npm${exe}`;

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(' ')}  (cwd: ${cwd})`);
  // On Windows, modern Node refuses to spawn a .cmd shim (npm.cmd) without
  // shell:true — it throws EINVAL. Run those through the shell and quote args
  // containing spaces so paths like "C:\\Program Files\\…" survive.
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
  const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
  execFileSync(
    useShell ? quote(cmd) : cmd,
    useShell ? args.map(quote) : args,
    { cwd, stdio: 'inherit', shell: useShell },
  );
}

// 1. Resolve the EXACT installed version of each external from the server's
//    real node_modules (not the semver range), so the shipped tree is
//    reproducible against the committed lockfile.
const serverPkg = JSON.parse(
  readFileSync(join(repoRoot, 'apps', 'server', 'package.json'), 'utf8'),
);
const serverRequire = createRequire(join(repoRoot, 'apps', 'server', 'package.json'));
const dependencies = {};
for (const name of SERVER_EXTERNALS) {
  if (!serverPkg.dependencies?.[name]) {
    throw new Error(
      `"${name}" is listed as an external but isn't a dependency of @buildpilot/server`,
    );
  }
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

// 1b. Drift guard: a server dep that ships a native addon but ISN'T in
// SERVER_EXTERNALS would be silently inlined by esbuild and crash at runtime in
// the packaged app. Catch it at build time. (Pure-JS deps are meant to bundle.)
const externalSet = new Set(SERVER_EXTERNALS);
const nativeMissing = [];
for (const name of Object.keys(serverPkg.dependencies ?? {})) {
  if (externalSet.has(name)) continue;
  let depPkgPath;
  try {
    depPkgPath = serverRequire.resolve(`${name}/package.json`);
  } catch {
    continue;
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
      `${nativeMissing.join(', ')}. Add them to scripts/server-externals.mjs.`,
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

// 3. Copy the built web bundle into the resources tree so the packaged server
//    can serve the SPA from its own origin (BUILDPILOT_WEB_DIST points here).
const webSrc = join(repoRoot, 'apps', 'web', 'dist');
if (!existsSync(webSrc)) {
  throw new Error(
    `web bundle not found at ${webSrc} — run \`pnpm --filter @buildpilot/web build\` first ` +
      `(the \`dist\` script does this before packaging).`,
  );
}
rmSync(webDir, { recursive: true, force: true });
mkdirSync(dirname(webDir), { recursive: true });
cpSync(webSrc, webDir, { recursive: true });

console.log(
  '\n✓ Server runtime + web bundle prepared at src-tauri/resources (bundle + node_modules + web/dist).',
);

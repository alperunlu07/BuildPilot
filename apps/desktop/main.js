// Electron entry point. `dist/` is gitignored build output, but the Windows
// login item registered from a source checkout runs `electron.exe <this dir>`
// directly — no `pnpm start`, so no `build:main`. If `dist/` has been cleaned
// since, compile it here instead of failing with "Cannot find module
// dist/main.js". A packaged app always ships `dist/`, so this never fires there.
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const compiled = join(__dirname, 'dist', 'main.js');

if (!existsSync(compiled)) {
  const { execFileSync } = require('node:child_process');
  const tsc = require.resolve('typescript/bin/tsc', { paths: [__dirname] });
  // Electron's own binary runs as plain Node with this flag set.
  execFileSync(process.execPath, [tsc, '-p', join(__dirname, 'tsconfig.json')], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  });
}

require(compiled);

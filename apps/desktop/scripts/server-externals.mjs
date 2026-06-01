// The single source of truth for which server dependencies CANNOT be inlined
// into the esbuild bundle and must therefore be shipped as real, installed
// node_modules beside it (and, for native addons, rebuilt for Electron's ABI).
//
// Keep this list minimal: everything pure-JS (fastify, @aws-sdk, zod, …) is
// bundled into server/index.cjs, so the only deps we have to install + ship
// are the native addons and the pino logging family (which spawns a worker
// thread and resolves its transport module from disk at runtime).
// These are all direct dependencies of @buildpilot/server, so their versions
// resolve from its package.json. pino's own runtime deps (thread-stream,
// sonic-boom, …) are pulled in transitively by `npm install` and don't need
// listing here — and since pino itself is external, esbuild never traverses
// into them.
export const SERVER_EXTERNALS = [
  // Native addons (.node binaries — must match Electron's Node ABI).
  'better-sqlite3',
  'ssh2',
  // pino logs through a worker thread that require()s its transport
  // (pino-pretty) by path at runtime — can't be bundled.
  'pino',
  'pino-pretty',
];

// Subset that are native addons and need `@electron/rebuild` after install.
export const NATIVE_EXTERNALS = ['better-sqlite3', 'ssh2'];

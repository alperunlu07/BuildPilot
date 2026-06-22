// The single source of truth for which server dependencies CANNOT be inlined
// into the esbuild bundle and must therefore be shipped as real, installed
// node_modules beside it.
//
// Keep this list minimal: everything pure-JS (fastify, @aws-sdk, zod, …) is
// bundled into resources/server/index.cjs, so the only deps we have to install
// and ship are the native addons and the pino logging family (which spawns a
// worker thread and resolves its transport module from disk at runtime).
// These are all direct dependencies of @buildpilot/server, so their versions
// resolve from its package.json. pino's own runtime deps (thread-stream,
// sonic-boom, …) are pulled in transitively by `npm install` and don't need
// listing here — and since pino itself is external, esbuild never traverses
// into them.
//
// Unlike the Electron build, the packaged Tauri app runs the server under a
// REAL Node runtime (a shipped `runtime/node`, or the system `node`), so the
// native addons are built for ordinary Node's ABI by the `npm install` itself —
// there is NO Electron-ABI rebuild step.
export const SERVER_EXTERNALS = [
  // Native addons (.node binaries — built for the runtime Node's ABI on install).
  'better-sqlite3',
  'ssh2',
  // pino logs through a worker thread that require()s its transport
  // (pino-pretty) by path at runtime — can't be bundled.
  'pino',
  'pino-pretty',
];

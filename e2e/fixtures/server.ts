import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import * as net from 'node:net';

// Playwright compiles this file as CommonJS (the root package.json has no
// "type": "module"), so __dirname is provided by the host.
const HERE: string = __dirname;
const REPO_ROOT = resolve(HERE, '..', '..');

// Ports we use across all E2E runs. Allocated low in the dynamic range so
// they're unlikely to clash with the dev defaults (51731/51732).
//
// 51741 — BuildPilot API
// 51742 — Vite static preview
export const API_PORT = 51741;
export const WEB_PORT = 51742;

export interface RunningStack {
  homeDir: string;
  apiUrl: string;
  webUrl: string;
  shutdown(): Promise<void>;
}

async function waitForUrl(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await sleep(250);
  }
  throw new Error(`${label} did not respond at ${url} within ${timeoutMs}ms (last error: ${String(lastErr)})`);
}

async function waitForPortOpen(port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise<void>((resolveFn) => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.once('connect', () => {
        sock.destroy();
        resolveFn();
      });
      sock.once('timeout', () => {
        sock.destroy();
        resolveFn();
      });
      sock.once('error', () => {
        sock.destroy();
        resolveFn();
      });
      sock.connect(port, '127.0.0.1');
    });
    try {
      await new Promise<void>((res, rej) => {
        const sock = new net.Socket();
        sock.once('connect', () => {
          sock.destroy();
          res();
        });
        sock.once('error', rej);
        sock.connect(port, '127.0.0.1');
      });
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`port ${port} never opened`);
}

// Spawns:
//   1. The BuildPilot Fastify server with BUILDPILOT_HOME pointed at an
//      isolated temp dir + a config.json that pins the random port.
//   2. A Vite dev server for apps/web, with the proxy redirected to our
//      random API port.
//
// The fixture returns a `shutdown()` that kills both children and removes
// the temp dir.
export async function startStack(): Promise<RunningStack> {
  const homeDir = mkdtempSync(join(tmpdir(), 'buildpilot-e2e-'));
  mkdirSync(homeDir, { recursive: true });

  const config = {
    host: '127.0.0.1',
    port: API_PORT,
    pollIntervalSec: 60,
    dbPath: join(homeDir, 'db.sqlite'),
    webOrigin: `http://127.0.0.1:${WEB_PORT}`,
    telegram: { enabled: false, botToken: '', defaultChatId: '' },
    buildRetentionDays: 0,
    auth: { enabled: false, sessionSecret: '' },
  };
  writeFileSync(join(homeDir, 'config.json'), JSON.stringify(config, null, 2));

  const env = {
    ...process.env,
    BUILDPILOT_HOME: homeDir,
    LOG_LEVEL: 'warn',
  };

  // Server — `pnpm --filter @buildpilot/server start` runs tsx on src/index.ts.
  // Use `detached: true` + negative pgid kill so SIGTERM reaches the entire
  // process group (pnpm → tsx → node), not just the pnpm wrapper which
  // would leave the listener orphaned.
  const server: ChildProcess = spawn(
    'pnpm',
    ['--filter', '@buildpilot/server', 'start'],
    {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );

  server.stdout?.on('data', (d) => process.stderr.write(`[server] ${d}`));
  server.stderr?.on('data', (d) => process.stderr.write(`[server] ${d}`));

  // Web — Vite dev server with proxy pointing at our chosen API port. We
  // override the default port (51732) via CLI and inject the API host via
  // an env var consumed by a small wrapper script (see e2e/fixtures/web.ts).
  const web: ChildProcess = spawn(
    'pnpm',
    ['--filter', '@buildpilot/web', 'exec', 'vite', '--port', String(WEB_PORT), '--strictPort'],
    {
      cwd: REPO_ROOT,
      env: {
        ...env,
        BUILDPILOT_API_PORT: String(API_PORT),
        // Opt the dev bundle into the e2e-only `window.useStore` exposure
        // (see apps/web/src/main.tsx). This flag is consumed at build/
        // hot-reload time by Vite as `import.meta.env.VITE_E2E`; without
        // it the responsive smoke tests can't drive store-level
        // affordances and the confirm-dialog viewport-fit test
        // hard-fails by design.
        VITE_E2E: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );
  web.stdout?.on('data', (d) => process.stderr.write(`[web] ${d}`));
  web.stderr?.on('data', (d) => process.stderr.write(`[web] ${d}`));

  await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`, 'server');
  await waitForPortOpen(WEB_PORT);
  // Vite serves index.html at root once the port is open.
  await waitForUrl(`http://127.0.0.1:${WEB_PORT}/`, 'web');

  return {
    homeDir,
    apiUrl: `http://127.0.0.1:${API_PORT}`,
    webUrl: `http://127.0.0.1:${WEB_PORT}`,
    async shutdown() {
      const killGroup = (proc: ChildProcess) =>
        new Promise<void>((resolveFn) => {
          if (proc.exitCode !== null || proc.pid === undefined) {
            resolveFn();
            return;
          }
          const pid = proc.pid;
          proc.once('exit', () => resolveFn());
          try {
            // Negative pgid → SIGTERM the entire process group, reaching the
            // pnpm wrapper's children (tsx / node / vite).
            process.kill(-pid, 'SIGTERM');
          } catch {
            try {
              proc.kill('SIGTERM');
            } catch {
              /* already gone */
            }
          }
          setTimeout(() => {
            if (proc.exitCode === null) {
              try {
                process.kill(-pid, 'SIGKILL');
              } catch {
                /* already gone */
              }
            }
          }, 3000);
        });
      await Promise.all([killGroup(server), killGroup(web)]);
      if (existsSync(homeDir)) {
        rmSync(homeDir, { recursive: true, force: true });
      }
    },
  };
}

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { BASE_URL } from './config';

let serverProcess: ChildProcess | null = null;

async function isServerUp(): Promise<boolean> {
  try {
    // /api/health is always public (even with auth enabled), so this probe
    // works without a credential — unlike /api/system/info, which is gated.
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// Resolve how to launch the BuildPilot server. Three modes, in priority order:
//   1. BUILDPILOT_SERVER_CMD — explicit override ("node /path/server.cjs").
//   2. Packaged build — a bundled `server/index.cjs` shipped as an extra
//      resource (see electron-builder.yml). Run with the bundled Node (Electron).
//   3. Dev checkout — run the TypeScript source through the workspace `tsx`.
function resolveServerLaunch(): { cmd: string; args: string[]; cwd: string } | null {
  const override = process.env.BUILDPILOT_SERVER_CMD;
  if (override) {
    const [cmd, ...args] = override.split(' ');
    return { cmd: cmd!, args, cwd: process.cwd() };
  }

  if (app.isPackaged) {
    const bundled = join(process.resourcesPath, 'server', 'index.cjs');
    if (existsSync(bundled)) {
      // ELECTRON_RUN_AS_NODE makes the Electron binary behave as plain Node,
      // so we don't need a separate Node install on the user's machine.
      return {
        cmd: process.execPath,
        args: [bundled],
        cwd: join(process.resourcesPath, 'server'),
      };
    }
    return null;
  }

  // Dev: repo root is three levels up from apps/desktop/dist.
  const repoRoot = join(app.getAppPath(), '..', '..', '..');
  const entry = join(repoRoot, 'apps', 'server', 'src', 'index.ts');
  if (!existsSync(entry)) return null;

  // pnpm hoists tsx into the server package's bin rather than the root, so
  // probe the likely locations and use the first that resolves.
  const tsxName = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const candidates = [
    join(repoRoot, 'apps', 'server', 'node_modules', '.bin', tsxName),
    join(repoRoot, 'node_modules', '.bin', tsxName),
    join(repoRoot, 'node_modules', '.pnpm', 'node_modules', '.bin', tsxName),
  ];
  const tsxBin = candidates.find((c) => existsSync(c));
  if (!tsxBin) return null;
  return { cmd: tsxBin, args: [entry], cwd: repoRoot };
}

// Start (or adopt) the BuildPilot server and resolve once it answers. If a
// server is already listening — e.g. the user runs `pnpm dev` separately — we
// adopt it instead of spawning a second one.
export async function ensureServer(
  onLog?: (line: string) => void,
): Promise<boolean> {
  if (await isServerUp()) {
    onLog?.('Adopted an already-running BuildPilot server.');
    return true;
  }

  const launch = resolveServerLaunch();
  if (!launch) {
    onLog?.('Could not locate the BuildPilot server to launch.');
    return false;
  }

  const env = { ...process.env };
  if (app.isPackaged) {
    // Run the Electron binary as plain Node, and point the server at the web
    // bundle shipped beside it so it serves the SPA from its own origin.
    env.ELECTRON_RUN_AS_NODE = '1';
    env.BUILDPILOT_WEB_DIST = join(process.resourcesPath, 'web', 'dist');
  }

  serverProcess = spawn(launch.cmd, launch.args, {
    cwd: launch.cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout?.on('data', (d) => onLog?.(String(d).trimEnd()));
  serverProcess.stderr?.on('data', (d) => onLog?.(String(d).trimEnd()));
  serverProcess.on('exit', (code) => {
    onLog?.(`BuildPilot server exited (code ${code ?? 'null'}).`);
    serverProcess = null;
  });

  return waitForServer();
}

export function stopServer(): void {
  if (!serverProcess) return;
  // SIGTERM lets Fastify close gracefully; Windows ignores the signal name
  // but kill() still terminates the child.
  serverProcess.kill();
  serverProcess = null;
}

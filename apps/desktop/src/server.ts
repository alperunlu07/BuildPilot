import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { getBaseUrl, refreshConfig } from './config';

// The server child WE spawned, or null when we either haven't spawned one or we
// adopted an already-running server. We only ever kill a process we own; an
// adopted server (e.g. the user's own `pnpm dev`) is left alone.
let serverProcess: ChildProcess | null = null;

// True once stopServer() (app quit / teardown) has run, so the child's 'exit'
// handler knows the exit was intentional and must NOT trigger an auto-restart.
let shuttingDown = false;

// Auto-restart bookkeeping. A spawned server that dies unexpectedly is
// respawned with a capped backoff, but only up to a small number of rapid
// consecutive failures — past that we give up rather than spin forever on a
// server that can't stay up (bad config, port taken, crash loop). A healthy
// restart (one that answers /api/health) resets the counter.
const RESTART_BASE_MS = 1000;
const RESTART_MAX_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;
let consecutiveFailures = 0;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
// Remembered so an auto-restart logs to the same stream as the initial launch.
let logSink: ((line: string) => void) | undefined;

async function isServerUp(): Promise<boolean> {
  try {
    // /api/health is always public (even with auth enabled), so this probe
    // works without a credential — unlike /api/system/info, which is gated.
    const res = await fetch(`${getBaseUrl()}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Probe /api/health and confirm it returns the BuildPilot shape
// ({ ok: true, version }). A bare `res.ok` would also accept an unrelated
// service squatting on our port; this guards adoption against that. Returns the
// reported version on a match, or null otherwise.
async function probeBuildPilot(): Promise<string | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    if (
      typeof body === 'object' &&
      body !== null &&
      (body as { ok?: unknown }).ok === true &&
      typeof (body as { version?: unknown }).version === 'string'
    ) {
      return (body as { version: string }).version;
    }
    return null;
  } catch {
    return null;
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

// Split a command string into argv, respecting single/double quotes so a
// command or path containing spaces (very common on Windows, e.g.
// "C:\Program Files\…") parses as one token. Replaces the naive split(' '),
// which would shatter such a path across multiple args.
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let started = false; // distinguishes an empty quoted token ("") from no token

  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (ch === ' ' || ch === '\t') {
      if (started) {
        tokens.push(current);
        current = '';
        started = false;
      }
    } else {
      current += ch;
      started = true;
    }
  }
  if (started) tokens.push(current);
  return tokens;
}

// Resolve how to launch the BuildPilot server. Three modes, in priority order:
//   1. BUILDPILOT_SERVER_CMD — explicit override ("node /path/server.cjs").
//   2. Packaged build — a bundled `server/index.cjs` shipped as an extra
//      resource (see electron-builder.yml). Run with the bundled Node (Electron).
//   3. Dev checkout — run the TypeScript source through the workspace `tsx`.
function resolveServerLaunch(): { cmd: string; args: string[]; cwd: string } | null {
  const override = process.env.BUILDPILOT_SERVER_CMD;
  if (override) {
    const [cmd, ...args] = tokenize(override);
    if (!cmd) return null;
    return { cmd, args, cwd: process.cwd() };
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

  // Dev: this compiled module lives in apps/desktop/dist, so the repo root is
  // three levels up (dist → desktop → apps → root). We anchor on the module's
  // own location rather than app.getAppPath(), which returns apps/desktop (the
  // app dir), not dist — an off-by-one that left the dev spawn unable to find
  // the server source.
  const repoRoot = join(__dirname, '..', '..', '..');
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

// Spawn the server child and wire its logging + exit-driven auto-restart. Does
// NOT wait for readiness — callers use waitForServer for that. Returns false if
// the launch target couldn't be located.
function spawnServer(onLog?: (line: string) => void): boolean {
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

  // On Windows, modern Node (the one embedded in Electron) refuses to spawn a
  // .cmd/.bat shim (e.g. the dev `tsx.cmd`) without shell:true — it throws
  // EINVAL. Run those through the shell and quote the command + args so paths
  // containing spaces survive. Real executables (packaged: electron.exe) spawn
  // directly as before.
  const useShell =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(launch.cmd);
  const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
  const child = spawn(
    useShell ? quote(launch.cmd) : launch.cmd,
    useShell ? launch.args.map(quote) : launch.args,
    {
      cwd: launch.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: useShell,
    },
  );
  serverProcess = child;

  child.stdout?.on('data', (d) => onLog?.(String(d).trimEnd()));
  child.stderr?.on('data', (d) => onLog?.(String(d).trimEnd()));
  child.on('exit', (code) => {
    // Ignore a stale exit from a child we've already replaced (defensive: an
    // old listener firing after a respawn shouldn't clear the new process).
    if (serverProcess === child) serverProcess = null;
    if (shuttingDown) {
      onLog?.(`BuildPilot server exited (code ${code ?? 'null'}).`);
      return;
    }
    // Unexpected death of a server WE own → schedule a capped-backoff restart.
    onLog?.(
      `BuildPilot server exited unexpectedly (code ${code ?? 'null'}).`,
    );
    scheduleRestart(onLog);
  });

  return true;
}

// Schedule an auto-restart after an unexpected exit, with exponential backoff
// capped at RESTART_MAX_MS. Gives up after MAX_CONSECUTIVE_FAILURES rapid
// failures so a server that can't stay up doesn't spin the loop forever; the
// counter resets once a restart answers /api/health (see attemptRestart).
function scheduleRestart(onLog?: (line: string) => void): void {
  if (shuttingDown) return;
  if (restartTimer) return; // a restart is already pending

  consecutiveFailures += 1;
  if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
    onLog?.(
      `BuildPilot server failed ${MAX_CONSECUTIVE_FAILURES} times in a row; ` +
        'giving up auto-restart. Restart BuildPilot to try again.',
    );
    return;
  }

  // Backoff grows with the failure count (1s, 2s, 4s, …) up to the cap.
  const delay = Math.min(
    RESTART_BASE_MS * 2 ** (consecutiveFailures - 1),
    RESTART_MAX_MS,
  );
  onLog?.(
    `Restarting BuildPilot server in ${Math.round(delay / 1000)}s ` +
      `(attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}).`,
  );
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void attemptRestart(onLog);
  }, delay);
}

async function attemptRestart(onLog?: (line: string) => void): Promise<void> {
  if (shuttingDown) return;
  // A port/token may have changed across the crash (e.g. config migration);
  // re-read so the health probe and later requests target the right origin.
  refreshConfig(onLog);

  if (!spawnServer(onLog)) {
    // Couldn't even launch — count it and back off again.
    scheduleRestart(onLog);
    return;
  }
  if (await waitForServer()) {
    onLog?.('BuildPilot server is back up.');
    consecutiveFailures = 0; // healthy → reset the failure cap
  }
  // If it didn't come up, the child's own 'exit' handler will fire and
  // re-enter scheduleRestart with the incremented counter.
}

// Start (or adopt) the BuildPilot server and resolve once it answers. If a
// server is already listening — e.g. the user runs `pnpm dev` separately — we
// adopt it instead of spawning a second one (and never kill it on quit).
export async function ensureServer(
  onLog?: (line: string) => void,
): Promise<boolean> {
  logSink = onLog;
  shuttingDown = false;

  // Adopt an already-running server only if it actually answers with the
  // BuildPilot health shape — otherwise an unrelated service squatting on the
  // port would be silently treated as ours.
  const adoptedVersion = await probeBuildPilot();
  if (adoptedVersion !== null) {
    serverProcess = null; // adopted: not ours to kill
    onLog?.(
      `Adopted an already-running BuildPilot server (version ${adoptedVersion}).`,
    );
    return true;
  }

  consecutiveFailures = 0;
  if (!spawnServer(onLog)) return false;
  return waitForServer();
}

// Kill the owned child's whole process tree on Windows. With shell:true the
// child is cmd.exe → node; a plain kill() would terminate cmd.exe and ORPHAN
// the node server. taskkill /T walks the tree and /F forces it down.
function killTreeWindows(pid: number, onLog?: (line: string) => void): void {
  try {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } catch (err) {
    onLog?.(`Failed to kill server process tree: ${String(err)}`);
  }
}

// Stop the server WE own. Adopted servers (serverProcess === null) are left
// running. SIGTERM lets Fastify close gracefully; if the child hasn't exited
// within the grace window we escalate to SIGKILL (or a forced tree-kill on
// Windows). Awaitable so quit paths can let teardown finish.
export async function stopServer(
  onLog?: (line: string) => void,
): Promise<void> {
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  const child = serverProcess;
  if (!child || child.pid === undefined) {
    serverProcess = null;
    return;
  }
  serverProcess = null;
  const log = onLog ?? logSink;

  if (process.platform === 'win32') {
    // The shell wrapper means signals don't reliably reach the node child;
    // kill the whole tree so nothing is orphaned.
    killTreeWindows(child.pid, log);
    return;
  }

  // POSIX: graceful SIGTERM, then escalate to SIGKILL if it lingers.
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      if (!child.killed) {
        log?.('Server did not exit on SIGTERM; sending SIGKILL.');
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      done();
    }, 5000);
    child.once('exit', done);
    try {
      child.kill('SIGTERM');
    } catch {
      done();
    }
  });
}

// Best-effort synchronous-ish teardown for hard exits (process exit / SIGINT /
// SIGTERM of the Electron main itself), where we can't await. We just fire the
// kill so the server/node child doesn't outlive us. Registered once.
let teardownRegistered = false;
export function registerProcessTeardown(onLog?: (line: string) => void): void {
  if (teardownRegistered) return;
  teardownRegistered = true;

  const teardown = (): void => {
    shuttingDown = true;
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    const child = serverProcess;
    if (!child || child.pid === undefined) return;
    serverProcess = null;
    if (process.platform === 'win32') {
      killTreeWindows(child.pid, onLog ?? logSink);
    } else {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  };

  // 'exit' can't run async work but synchronous kills still fire. SIGINT/
  // SIGTERM cover Ctrl-C and OS shutdown signals to the Electron main.
  process.once('exit', teardown);
  process.once('SIGINT', () => {
    teardown();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    teardown();
    process.exit(0);
  });
}

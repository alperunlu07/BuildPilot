import { spawn } from 'node:child_process';
import type { ClientChannel } from 'ssh2';
import type { StepContext } from '../engine';
import { buildConnectConfig, connect, parseHost, pipeStream, resolveHost } from './_ssh';

// Common shape for "this step might run locally OR on a saved/inline host".
// The runner doesn't care which — it gets stdout/stderr streamed through
// ctx.log either way.
export interface MaybeRemote {
  hostId?: string;
  host?: string;
  identityFile?: string;
  password?: string;
  skipStrictHostKey?: string;
}

export function isRemote(d: MaybeRemote): boolean {
  if (d.hostId && d.hostId.trim().length > 0) return true;
  if (d.host && d.host.trim().length > 0) return true;
  return false;
}

// Single shell invocation on whichever side the user pointed us at. Returns
// non-zero exit codes by throwing — that's the engine's failure contract.
// On the local path we do NOT shell out; we use spawn(cmd, args) and the
// caller assembles a single command string when needed.
export async function execMaybeRemote(opts: {
  ctx: StepContext;
  d: MaybeRemote;
  // Already-formed shell command string — the remote path passes this through
  // /bin/sh on the other side; the local path runs it via the platform shell.
  command: string;
  // Optional cwd. Local: passed to spawn. Remote: prefixed as `cd <cwd> &&`.
  cwd?: string;
  // Friendly label for the first log line. Defaults to the command itself.
  label?: string;
}): Promise<void> {
  const { ctx, d, command, cwd, label } = opts;
  if (!command || command.trim().length === 0) {
    throw new Error('exec: empty command');
  }

  if (isRemote(d)) {
    const resolved = resolveHost(d);
    const cfg = await buildConnectConfig(resolved.spec, {
      identityFile: resolved.identityFile,
      password: resolved.password,
      skipStrictHostKey: resolved.skipStrictHostKey,
    });
    const { user, host, port } = parseHost(resolved.spec);
    let remoteCmd = command;
    if (cwd && cwd.trim().length > 0) remoteCmd = `cd ${shellQuote(cwd)} && ${remoteCmd}`;
    ctx.log(`ssh ${user}@${host}:${port}`);
    ctx.log(`remote: ${label ?? remoteCmd}`);
    const conn = await connect(cfg);
    try {
      const stream = await new Promise<ClientChannel>((resolve, reject) => {
        conn.exec(remoteCmd, (err, s) => (err ? reject(err) : resolve(s)));
      });
      const code = await pipeStream(stream as never, (line, level) => ctx.log(line, level));
      if (code !== 0) throw new Error(`ssh exited with code ${code}`);
    } finally {
      conn.end();
    }
    return;
  }

  ctx.log(`local: ${label ?? command}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: cwd && cwd.trim().length > 0 ? cwd : ctx.project.path,
      env: process.env,
    });
    ctx.attachProcess(child);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exited with code ${code}`));
    });
  });
}

export function shellQuote(s: string): string {
  // POSIX-ish single-quote escape that survives nested cd. Wrap in single
  // quotes and escape any embedded ones — works on bash/zsh and is harmless
  // on a Mac shell where xcrun & friends already accept normal POSIX quoting.
  return `'${s.replace(/'/g, "'\\''")}'`;
}

import { spawn } from 'node:child_process';
import type { RemoteSshStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

// Quote a path for use inside a remote single-line shell command. We embed
// the value inside double quotes and escape only the characters that would
// break out of them ("`$\). Backslashes survive untouched, which matches
// /bin/sh's behavior inside double quotes.
function shellQuote(s: string): string {
  return `"${s.replace(/(["`$\\])/g, '\\$1')}"`;
}

export async function runRemoteSsh(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<RemoteSshStepData>;
  if (!d.host) throw new Error('remoteSsh: missing "host"');
  if (!d.command || d.command.trim().length === 0) {
    throw new Error('remoteSsh: missing "command"');
  }

  let host = d.host;
  let port: string | null = null;
  const colonIdx = host.lastIndexOf(':');
  if (colonIdx > 0 && /^\d+$/.test(host.slice(colonIdx + 1))) {
    port = host.slice(colonIdx + 1);
    host = host.slice(0, colonIdx);
  }

  const args: string[] = [];
  if (d.identityFile && d.identityFile.trim().length > 0) {
    args.push('-i', d.identityFile);
  }
  if (asBool(d.skipStrictHostKey)) {
    args.push('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null');
  }
  args.push('-o', 'BatchMode=yes');
  if (port) args.push('-p', port);
  args.push(host);

  let remoteCmd = d.command;
  if (d.cwd && d.cwd.trim().length > 0) {
    remoteCmd = `cd ${shellQuote(d.cwd)} && ${remoteCmd}`;
  }
  args.push(remoteCmd);

  ctx.log(`ssh ${host}${port ? `:${port}` : ''}`);
  ctx.log(`remote: ${remoteCmd}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('ssh', args, { env: process.env });
    ctx.attachProcess(child);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ssh exited with code ${code}`));
    });
  });
}

import type { ClientChannel } from 'ssh2';
import type { RemoteSshStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { buildConnectConfig, connect, parseHost, pipeStream } from './_ssh';

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

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

  const { host, port, user } = parseHost(d.host);
  const cfg = await buildConnectConfig(d.host, {
    identityFile: d.identityFile,
    password: d.password,
    skipStrictHostKey: asBool(d.skipStrictHostKey),
  });

  let remoteCmd = d.command;
  if (d.cwd && d.cwd.trim().length > 0) {
    remoteCmd = `cd ${shellQuote(d.cwd)} && ${remoteCmd}`;
  }

  ctx.log(`ssh ${user}@${host}:${port}`);
  ctx.log(`remote: ${remoteCmd}`);

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
}

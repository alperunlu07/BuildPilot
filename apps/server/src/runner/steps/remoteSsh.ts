import type { ClientChannel } from 'ssh2';
import type { RemoteSshStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { buildConnectConfig, connect, parseHost, pipeStream, resolveHost } from './_ssh';

function shellQuote(s: string): string {
  return `"${s.replace(/(["`$\\])/g, '\\$1')}"`;
}

export async function runRemoteSsh(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<RemoteSshStepData>;
  if (!d.command || d.command.trim().length === 0) {
    throw new Error('remoteSsh: missing "command"');
  }

  // hostId picks a saved host; otherwise we honour the inline fields. Either
  // way we end up with a single ResolvedHost the ssh2 client understands.
  const resolved = resolveHost({
    hostId: d.hostId,
    host: d.host,
    identityFile: d.identityFile,
    password: d.password,
    skipStrictHostKey: d.skipStrictHostKey,
  });
  const cfg = await buildConnectConfig(resolved.spec, {
    identityFile: resolved.identityFile,
    password: resolved.password,
    skipStrictHostKey: resolved.skipStrictHostKey,
  });
  const { user, host, port } = parseHost(resolved.spec);

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

import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { SftpUploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { buildConnectConfig, connect, parseHost, resolveHost } from './_ssh';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

export async function runSftpUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SftpUploadStepData>;
  if (!d.localPath) throw new Error('sftpUpload: missing "localPath"');
  if (!d.remotePath) throw new Error('sftpUpload: missing "remotePath"');

  const localAbs = isAbsolute(d.localPath) ? d.localPath : join(ctx.project.path, d.localPath);
  const stat = await fs.stat(localAbs);
  if (!stat.isFile()) throw new Error(`sftpUpload: not a file: ${localAbs}`);

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
  const { host, port, user } = parseHost(resolved.spec);

  ctx.log(`sftp ${user}@${host}:${port}`);
  ctx.log(`${localAbs} (${fmtBytes(stat.size)}) -> ${d.remotePath}`);

  const conn = await connect(cfg);
  try {
    const sftp = await new Promise<{
      fastPut: (
        local: string,
        remote: string,
        opts: { step?: (transferred: number, _c: number, total: number) => void },
        cb: (err: Error | undefined) => void,
      ) => void;
      end(): void;
    }>((resolve, reject) => {
      // ssh2.Client.sftp(cb) — typed by @types/ssh2 with a richer surface;
      // we only need fastPut so we narrow.
      (conn as unknown as { sftp(cb: (err: Error | undefined, sftp: unknown) => void): void }).sftp(
        (err, s) => (err ? reject(err) : resolve(s as never)),
      );
    });
    const t0 = Date.now();
    let lastReport = 0;
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(
        localAbs,
        d.remotePath!,
        {
          step: (transferred, _c, total) => {
            const now = Date.now();
            if (now - lastReport > 2000) {
              const pct = total > 0 ? ((transferred / total) * 100).toFixed(1) : '?';
              ctx.log(
                `transferred ${fmtBytes(transferred)} / ${fmtBytes(total)} (${pct}%)`,
                'stdout',
              );
              lastReport = now;
            }
          },
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    ctx.log(`upload complete in ${dur}s`, 'success');
  } finally {
    conn.end();
  }
}

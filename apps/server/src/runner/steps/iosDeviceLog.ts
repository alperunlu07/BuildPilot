import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { IosDeviceLogStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { insertBuildArtifact } from '../../store/buildArtifacts';

// Pure argv builder so we can unit-test the invocation without spawning.
// idevicesyslog flags reference (libimobiledevice):
//   -u UDID         target a specific device
//   -n              connect to a network device
//   -x              exit when the device disconnects
//   --no-colors     strip ANSI colours (must-have when writing to a file)
//   -m STRING       only print messages CONTAINING STRING
//   -M STRING       only print messages NOT containing STRING
export function buildIosDeviceLogArgs(d: Partial<IosDeviceLogStepData>): string[] {
  const args: string[] = [];
  if (d.udid && d.udid.trim().length > 0) {
    args.push('-u', d.udid.trim());
  }
  if ((d.network ?? 'false') === 'true') {
    args.push('-n');
  }
  if ((d.exitOnDisconnect ?? 'true') !== 'false') {
    args.push('-x');
  }
  // --no-colors is on by default for the on-disk log; user can override
  // by setting noColors:'false' if they want a tty-style coloured file.
  if ((d.noColors ?? 'true') !== 'false') {
    args.push('--no-colors');
  }
  if (d.match && d.match.trim().length > 0) {
    args.push('-m', d.match.trim());
  }
  if (d.unmatch && d.unmatch.trim().length > 0) {
    args.push('-M', d.unmatch.trim());
  }
  return args;
}

function resolveIosSyslogPath(custom?: string): string {
  if (custom && custom.trim().length > 0) return custom.trim();
  // libimobiledevice via Homebrew on Apple Silicon lives here by default.
  // Falling back to bare `idevicesyslog` lets PATH resolve it on Intel /
  // alternate installs.
  return 'idevicesyslog';
}

export async function runIosDeviceLog(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<IosDeviceLogStepData>;
  const durationSec =
    typeof d.durationSec === 'number' && d.durationSec > 0 ? d.durationSec : 30;
  const bin = resolveIosSyslogPath(d.idevicesyslogPath);

  const outputRaw =
    d.outputPath && d.outputPath.trim().length > 0
      ? d.outputPath.trim()
      : `ios-syslog-${ctx.build.id}.txt`;
  const outputAbs = isAbsolute(outputRaw) ? outputRaw : join(ctx.project.path, outputRaw);

  const args = buildIosDeviceLogArgs(d);
  ctx.log(`${bin} ${args.join(' ')}  → ${outputAbs} (${durationSec}s)`);

  const fileStream = createWriteStream(outputAbs);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, { env: process.env });
      // Syslog volume can be huge — route stdout straight to disk rather
      // than through ctx.log line-by-line (which would flood the build feed).
      // Stderr (connection / pairing errors) is small and stays in the feed.
      child.stdout?.pipe(fileStream, { end: false });
      child.stderr?.on('data', (c: Buffer) => {
        for (const line of c.toString().split(/\r?\n/)) {
          if (line.length > 0) ctx.log(line, 'stderr');
        }
      });

      const timer = setTimeout(() => {
        ctx.log(`syslog duration reached (${durationSec}s) — stopping capture`);
        // SIGTERM is graceful — idevicesyslog closes its usbmuxd / network
        // service connection and exits cleanly.
        child.kill();
      }, durationSec * 1000);

      child.on('error', (err) => {
        clearTimeout(timer);
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          reject(
            new Error(
              `${bin} not found — install libimobiledevice (\`brew install libimobiledevice\`) and ensure idevicesyslog is on PATH (or set idevicesyslogPath).`,
            ),
          );
        } else {
          reject(err);
        }
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        // Exit via our SIGTERM after the timer fires is the success path.
        // Any other non-zero exit means the relay died on its own
        // (no device, USB drop, pairing rejection).
        if (signal != null || code === 0) resolve();
        else reject(new Error(`idevicesyslog exited with code ${code}`));
      });
    });
  } finally {
    await new Promise<void>((resolve) => fileStream.end(() => resolve()));
  }

  const stat = await fs.stat(outputAbs).catch(() => null);
  if (!stat) {
    ctx.log(`(syslog output file not present at ${outputAbs})`, 'stderr');
    return;
  }
  ctx.log(`captured ${formatBytes(stat.size)} → ${outputAbs}`);

  if ((d.registerArtifact ?? 'true') !== 'false') {
    insertBuildArtifact({
      buildId: ctx.build.id,
      path: outputAbs,
      size: stat.size,
      mtime: stat.mtimeMs,
    });
    ctx.log(`+ artifact ${outputAbs}`, 'stdout');
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

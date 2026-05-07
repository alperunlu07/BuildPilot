import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { AdbLogcatStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { adbDevicePrefix, resolveAdbPath } from './_adb';
import { insertBuildArtifact } from '../../store/buildArtifacts';

// Pure argv builder for the logcat invocation itself (no -c clear, no
// duration handling — those happen out-of-band).
export function buildAdbLogcatArgs(d: Partial<AdbLogcatStepData>): string[] {
  const args = [...adbDevicePrefix(d.serial), 'logcat'];
  if (d.filter && d.filter.trim().length > 0) {
    args.push(...d.filter.trim().split(/\s+/).filter(Boolean));
  }
  return args;
}

export async function runAdbLogcat(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AdbLogcatStepData>;
  const durationSec = typeof d.durationSec === 'number' && d.durationSec > 0 ? d.durationSec : 30;
  const adb = resolveAdbPath(d.adbPath);

  const outputRaw = (d.outputPath && d.outputPath.trim().length > 0
    ? d.outputPath.trim()
    : `logcat-${ctx.build.id}.txt`);
  const outputAbs = isAbsolute(outputRaw) ? outputRaw : join(ctx.project.path, outputRaw);

  if ((d.clearFirst ?? 'true') !== 'false') {
    ctx.log(`${adb} logcat -c (clearing ring buffer)`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(adb, [...adbDevicePrefix(d.serial), 'logcat', '-c'], {
        env: process.env,
      });
      ctx.attachProcess(child);
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`adb logcat -c exited with code ${code}`));
      });
    });
  }

  const args = buildAdbLogcatArgs(d);
  ctx.log(`${adb} ${args.join(' ')}  → ${outputAbs} (${durationSec}s)`);

  const fileStream = createWriteStream(outputAbs);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(adb, args, { env: process.env });
      // Pipe stdout straight to the file — logcat output gets large quickly
      // and routing every line through ctx.log would overwhelm the build feed.
      // Stderr still goes through ctx so connection errors are visible.
      child.stdout?.pipe(fileStream, { end: false });
      child.stderr?.on('data', (c: Buffer) => {
        for (const line of c.toString().split(/\r?\n/)) {
          if (line.length > 0) ctx.log(line, 'stderr');
        }
      });

      const timer = setTimeout(() => {
        ctx.log(`logcat duration reached (${durationSec}s) — stopping capture`);
        // SIGTERM is graceful enough for adb on POSIX; on Windows kill()
        // forcibly terminates which is the only option anyway.
        child.kill();
      }, durationSec * 1000);

      child.on('error', (err) => {
        clearTimeout(timer);
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          reject(new Error(`${adb} not found — install Android Platform Tools and ensure adb is on PATH (or set adbPath)`));
        } else {
          reject(err);
        }
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        // We expect exit via our SIGTERM after the timer fires, so a null
        // exit code with a signal is the success path. Any other non-zero
        // exit with no signal means logcat died on its own (no device, etc.).
        if (signal != null || code === 0) resolve();
        else reject(new Error(`adb logcat exited with code ${code}`));
      });
    });
  } finally {
    await new Promise<void>((resolve) => fileStream.end(() => resolve()));
  }

  const stat = await fs.stat(outputAbs).catch(() => null);
  if (!stat) {
    ctx.log(`(logcat output file not present at ${outputAbs})`, 'stderr');
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

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { StepContext } from '../engine';

// Centralises adb invocation for the four adb* steps. Returns the resolved
// adb command name; runners call ctx.log() and attachProcess() themselves
// so streaming behaviour stays uniform with the rest of the engine.
export function resolveAdbPath(adbPath?: string): string {
  const v = adbPath?.trim();
  return v && v.length > 0 ? v : 'adb';
}

// Build an argv prefix that targets a specific device when `serial` is set.
// `adb -s <serial>` must come BEFORE the subcommand, so this returns just
// the leading flags — the caller appends the subcommand & its args.
export function adbDevicePrefix(serial?: string): string[] {
  const v = serial?.trim();
  return v && v.length > 0 ? ['-s', v] : [];
}

// Spawn adb with the given args, stream output, and reject on non-zero exit.
// Used by adbConnect / adbInstall / adbShellLaunch. (adbLogcat needs custom
// timeout-based termination so it doesn't go through here.)
export async function runAdbStreaming(
  ctx: StepContext,
  adb: string,
  args: string[],
): Promise<void> {
  ctx.log(`${adb} ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`);
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(adb, args, { env: process.env });
    ctx.attachProcess(child);
    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(new Error(`${adb} not found — install Android Platform Tools and ensure adb is on PATH (or set adbPath)`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`adb exited with code ${code}`));
    });
  });
}

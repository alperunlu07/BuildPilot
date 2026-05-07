import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { AdbInstallStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { adbDevicePrefix, resolveAdbPath, runAdbStreaming } from './_adb';

// Pure argv builder — exposed for unit tests. Resolves the apk path against
// projectRoot when relative; the caller still validates existence on disk.
export function buildAdbInstallArgs(
  d: Partial<AdbInstallStepData>,
  apkAbsPath: string,
): string[] {
  const flags: string[] = [];
  if ((d.replace ?? 'true') !== 'false') flags.push('-r');
  if (d.allowDowngrade === 'true') flags.push('-d');
  if (d.allowTest === 'true') flags.push('-t');
  return [...adbDevicePrefix(d.serial), 'install', ...flags, apkAbsPath];
}

export async function runAdbInstall(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AdbInstallStepData>;
  if (!d.apkPath || d.apkPath.trim().length === 0) {
    throw new Error('adbInstall: missing "apkPath"');
  }
  const raw = d.apkPath.trim();
  const apkAbs = isAbsolute(raw) ? raw : join(ctx.project.path, raw);

  const stat = await fs.stat(apkAbs).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`adbInstall: APK not found at ${apkAbs}`);
  }

  const adb = resolveAdbPath(d.adbPath);
  const args = buildAdbInstallArgs(d, apkAbs);
  await runAdbStreaming(ctx, adb, args);
}

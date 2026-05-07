import type { AdbShellLaunchStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { adbDevicePrefix, resolveAdbPath, runAdbStreaming } from './_adb';

// Pure argv builder. When `activity` is empty, falls back to the `monkey`
// trick (`am start` needs a component spec; monkey can launch the package's
// declared LAUNCHER intent without one).
export function buildAdbLaunchArgs(d: Partial<AdbShellLaunchStepData>): string[] {
  const pkg = d.packageName?.trim();
  if (!pkg || pkg.length === 0) {
    throw new Error('adbShellLaunch: missing "packageName"');
  }
  const wait = d.waitForLaunch === 'true' ? ['-W'] : [];

  const activityRaw = d.activity?.trim();
  const args = [...adbDevicePrefix(d.serial), 'shell'];

  if (!activityRaw || activityRaw.length === 0) {
    // monkey route — no activity component required
    args.push('monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1');
    return args;
  }

  // Component name normalisation: ".MainActivity" → "<pkg>/.MainActivity",
  // "com.x.app.MainActivity" → "<pkg>/com.x.app.MainActivity".
  const component = activityRaw.startsWith('.') || !activityRaw.includes('.')
    ? `${pkg}/${activityRaw.startsWith('.') ? activityRaw : `.${activityRaw}`}`
    : `${pkg}/${activityRaw}`;
  args.push('am', 'start', ...wait, '-n', component);
  return args;
}

export async function runAdbShellLaunch(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AdbShellLaunchStepData>;
  const adb = resolveAdbPath(d.adbPath);
  const args = buildAdbLaunchArgs(d);
  await runAdbStreaming(ctx, adb, args);
}

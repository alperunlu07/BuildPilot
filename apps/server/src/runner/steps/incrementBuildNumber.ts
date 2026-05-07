import type { IncrementBuildNumberStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure builder for the test suite. Two modes:
//   • agvtool:    `xcrun agvtool next-version -all` (auto-bump by 1) OR
//                 `xcrun agvtool new-version -all <v>` when versionString is set.
//   • plistBuddy: `/usr/libexec/PlistBuddy -c "Set :CFBundleVersion <v>" <plist>`
// agvtool must be invoked from the dir containing the .xcodeproj — that's the
// `cwd` field, plumbed through execMaybeRemote.
export function buildIncrementBuildNumberCommand(
  d: Partial<IncrementBuildNumberStepData>,
): string {
  const mode = d.mode ?? 'agvtool';
  if (mode === 'agvtool') {
    if (d.versionString && d.versionString.trim().length > 0) {
      return `xcrun agvtool new-version -all ${shellQuote(d.versionString)}`;
    }
    return 'xcrun agvtool next-version -all';
  }
  if (mode === 'plistBuddy') {
    if (!d.plistPath || d.plistPath.trim().length === 0) {
      throw new Error('incrementBuildNumber: missing "plistPath"');
    }
    if (!d.versionString || d.versionString.trim().length === 0) {
      throw new Error('incrementBuildNumber: missing "versionString"');
    }
    const arg = `Set :CFBundleVersion ${d.versionString}`;
    return `/usr/libexec/PlistBuddy -c ${shellQuote(arg)} ${shellQuote(d.plistPath)}`;
  }
  throw new Error(`incrementBuildNumber: invalid mode "${mode}"`);
}

export async function runIncrementBuildNumber(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<IncrementBuildNumberStepData>;
  const command = buildIncrementBuildNumberCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}

import type { IncrementBuildNumberStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { CFBUNDLE_VERSION_KEY, buildPlistBuddyCommand } from './_plist';

// Two modes:
//   agvtool    — `xcrun agvtool {new-version -all <v> | next-version -all}` (cwd
//                must contain .xcodeproj; next-version auto-bumps by 1).
//   plistBuddy — Set :CFBundleVersion via PlistBuddy on a given plist.
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
    return buildPlistBuddyCommand(
      `Set ${CFBUNDLE_VERSION_KEY} ${d.versionString}`,
      d.plistPath,
    );
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

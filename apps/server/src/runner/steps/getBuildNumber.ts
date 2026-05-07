import type { GetBuildNumberStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote } from './_exec';
import { CFBUNDLE_VERSION_KEY, buildPlistBuddyCommand } from './_plist';

// Reads CFBundleVersion via `agvtool what-version -terse` (cwd must contain
// the .xcodeproj) or `PlistBuddy Print :CFBundleVersion`.
export function buildGetBuildNumberCommand(d: Partial<GetBuildNumberStepData>): string {
  const mode = d.mode ?? 'agvtool';
  if (mode === 'agvtool') {
    return 'xcrun agvtool what-version -terse';
  }
  if (mode === 'plistBuddy') {
    if (!d.plistPath || d.plistPath.trim().length === 0) {
      throw new Error('getBuildNumber: missing "plistPath"');
    }
    return buildPlistBuddyCommand(`Print ${CFBUNDLE_VERSION_KEY}`, d.plistPath);
  }
  throw new Error(`getBuildNumber: invalid mode "${mode}"`);
}

export async function runGetBuildNumber(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<GetBuildNumberStepData>;
  const command = buildGetBuildNumberCommand(d);
  const out = await captureMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
  ctx.log(`build number: ${out.trim()}`, 'success');
}

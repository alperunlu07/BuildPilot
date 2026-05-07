import type { GetBuildNumberStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

// Pure builder for the test suite. Reads CFBundleVersion via either
// `agvtool what-version -terse` (run from the .xcodeproj dir) or
// `PlistBuddy -c "Print :CFBundleVersion" <plist>`.
export function buildGetBuildNumberCommand(d: Partial<GetBuildNumberStepData>): string {
  const mode = d.mode ?? 'agvtool';
  if (mode === 'agvtool') {
    return 'xcrun agvtool what-version -terse';
  }
  if (mode === 'plistBuddy') {
    if (!d.plistPath || d.plistPath.trim().length === 0) {
      throw new Error('getBuildNumber: missing "plistPath"');
    }
    return `/usr/libexec/PlistBuddy -c ${shellQuote('Print :CFBundleVersion')} ${shellQuote(d.plistPath)}`;
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
  // Trim then surface as a success line. Future work (Phase 4 Cluster C)
  // will plumb this into a real step-output / interpolation system.
  const value = out.trim();
  ctx.log(`build number: ${value}`, 'success');
}

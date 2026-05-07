import type { XcodeSelectStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Needs sudo on a stock Mac CI agent — `xcode-select -s` updates the
// /var/db/xcode_select_link symlink. Skip sudo via a bare `shell` step
// if your runner already has DevToolsSecurity enabled.
export function buildXcodeSelectArgs(d: Partial<XcodeSelectStepData>): string[] {
  if (!d.xcodePath || d.xcodePath.trim().length === 0) {
    throw new Error('xcodeSelect: missing "xcodePath"');
  }
  return ['sudo', 'xcode-select', '-s', shellQuote(d.xcodePath)];
}

export async function runXcodeSelect(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<XcodeSelectStepData>;
  const args = buildXcodeSelectArgs(d);
  await execMaybeRemote({
    ctx,
    d,
    command: args.join(' '),
    label: `xcode-select -s ${d.xcodePath}`,
  });
}

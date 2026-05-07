import type { XcodeSelectStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure builder for the test suite. `xcode-select -s` modifies the
// /var/db/xcode_select_link symlink and almost always needs sudo on a
// stock Mac CI agent — the recipe most operators wire into their
// passwordless sudoers entry. If your setup doesn't need sudo (e.g.
// `DevToolsSecurity -enable` already ran on the runner), wrap a `shell`
// step with the bare `xcode-select -s …` command instead.
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

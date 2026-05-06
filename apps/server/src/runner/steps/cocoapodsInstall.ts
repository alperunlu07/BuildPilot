import type { CocoapodsInstallStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Pure command builder. Returns the joined command string ready for
// execMaybeRemote — exposed for the test suite.
export function buildCocoapodsCommand(d: Partial<CocoapodsInstallStepData>): string {
  const sub = d.command ?? 'install';
  if (sub !== 'install' && sub !== 'update') {
    throw new Error(`cocoapodsInstall: invalid command "${sub}"`);
  }
  const parts: string[] = [];
  if (d.useBundleExec === 'true') parts.push('bundle', 'exec');
  parts.push('pod', sub);
  if (d.repoUpdate === 'true') parts.push('--repo-update');
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

export async function runCocoapodsInstall(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<CocoapodsInstallStepData>;
  const command = buildCocoapodsCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}

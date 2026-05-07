import type { EnsureGitStatusCleanStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote } from './_exec';

// Pure builder for the test suite. `git status --porcelain` prints one line
// per modified/untracked path and emits zero output when the tree is clean —
// perfect for a pre-tag / pre-release gate.
export function buildEnsureGitStatusCleanCommand(
  _d: Partial<EnsureGitStatusCleanStepData>,
): string {
  return 'git status --porcelain';
}

export async function runEnsureGitStatusClean(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<EnsureGitStatusCleanStepData>;
  const command = buildEnsureGitStatusCleanCommand(d);
  const out = await captureMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
  const trimmed = out.trim();
  if (trimmed.length > 0) {
    // Surface the offending paths so the operator can fix them locally.
    for (const line of trimmed.split(/\r?\n/)) ctx.log(line, 'stderr');
    throw new Error('working tree is not clean');
  }
}

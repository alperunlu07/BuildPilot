import simpleGit from 'simple-git';
import type { GitMergeStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

export async function runGitMerge(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<GitMergeStepData>;
  if (!d.sourceBranch || d.sourceBranch.trim().length === 0) {
    throw new Error('gitMerge: missing "sourceBranch"');
  }

  const args: string[] = ['merge'];
  if (asBool(d.noFastForward)) args.push('--no-ff');
  if (d.message && d.message.trim().length > 0) {
    args.push('-m', d.message);
  }
  args.push(d.sourceBranch);

  ctx.log(`git ${args.join(' ')}`);

  const git = simpleGit(ctx.project.path);
  try {
    const out = await git.raw(args);
    for (const line of out.split(/\r?\n/)) {
      if (line.length > 0) ctx.log(line, 'stdout');
    }
  } catch (err) {
    // simple-git embeds CONFLICT details in the error message; surface them
    // line-by-line so the log table groups the conflict files cleanly and
    // any AI auto-fix has plenty of context to work with.
    const msg = err instanceof Error ? err.message : String(err);
    for (const line of msg.split(/\r?\n/)) {
      if (line.length > 0) ctx.log(line, 'stderr');
    }
    throw new Error(`git merge failed (${d.sourceBranch})`);
  }
}

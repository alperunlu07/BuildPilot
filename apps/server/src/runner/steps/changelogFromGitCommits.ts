import {
  CHANGELOG_DEFAULT_MAX_COMMITS,
  type ChangelogFromGitCommitsStepData,
} from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

const FORMAT_TEMPLATES: Record<NonNullable<ChangelogFromGitCommitsStepData['format']>, string> = {
  subject: '%s',
  'subject-body': '%s%n%n%b%n---',
  oneline: '%h %s',
};

export function buildChangelogFromGitCommitsCommand(
  d: Partial<ChangelogFromGitCommitsStepData>,
): string {
  if (!d.fromRef || d.fromRef.trim().length === 0) {
    throw new Error('changelogFromGitCommits: missing "fromRef"');
  }
  const format = d.format ?? 'subject';
  const template = FORMAT_TEMPLATES[format];
  if (!template) {
    throw new Error(`changelogFromGitCommits: invalid format "${format}"`);
  }
  const toRef = d.toRef && d.toRef.trim().length > 0 ? d.toRef : 'HEAD';
  const range = `${d.fromRef}..${toRef}`;
  const maxCommits =
    typeof d.maxCommits === 'number' && d.maxCommits > 0
      ? Math.floor(d.maxCommits)
      : CHANGELOG_DEFAULT_MAX_COMMITS;
  return `git log --max-count=${maxCommits} --pretty=format:${shellQuote(template)} ${shellQuote(range)}`;
}

export async function runChangelogFromGitCommits(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<ChangelogFromGitCommitsStepData>;
  const command = buildChangelogFromGitCommitsCommand(d);
  const out = await captureMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
  const toRef = d.toRef && d.toRef.trim().length > 0 ? d.toRef : 'HEAD';
  ctx.log(`changelog (${d.fromRef}..${toRef}):`, 'info');
  for (const line of out.split(/\r?\n/)) {
    if (line.length > 0) ctx.log(line, 'info');
  }
}

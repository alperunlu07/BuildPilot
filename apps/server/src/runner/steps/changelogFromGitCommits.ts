import type { ChangelogFromGitCommitsStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { captureMaybeRemote, shellQuote } from './_exec';

// Maps the friendly `format` field onto a git log --pretty template. The
// values land verbatim inside single-quotes on argv, so any embedded
// single-quote in the template would break things — none of these contain
// one.
const FORMAT_TEMPLATES: Record<NonNullable<ChangelogFromGitCommitsStepData['format']>, string> = {
  subject: '%s',
  'subject-body': '%s%n%n%b%n---',
  oneline: '%h %s',
};

// Pure builder for the test suite. Produces e.g.
//   git log --pretty=format:'%s' 'v1.4.0..HEAD'
// fromRef is exclusive (commit at fromRef is excluded); toRef is inclusive
// and defaults to HEAD.
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
  return `git log --pretty=format:${shellQuote(template)} ${shellQuote(range)}`;
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
  // Multi-line emit so each commit subject becomes a separate log row —
  // future Phase 4 Cluster C step-output system will plumb this into
  // downstream steps as a single concatenated string.
  for (const line of out.split(/\r?\n/)) {
    if (line.length > 0) ctx.log(line, 'info');
  }
}

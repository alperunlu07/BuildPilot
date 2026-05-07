import { describe, expect, it } from 'vitest';
import { buildChangelogFromGitCommitsCommand } from './changelogFromGitCommits';

describe('buildChangelogFromGitCommitsCommand', () => {
  it('defaults to subject format and HEAD as toRef', () => {
    expect(buildChangelogFromGitCommitsCommand({ fromRef: 'v1.4.0' })).toBe(
      `git log --max-count=1000 --pretty=format:'%s' 'v1.4.0..HEAD'`,
    );
  });

  it('uses an explicit toRef when provided', () => {
    expect(
      buildChangelogFromGitCommitsCommand({ fromRef: 'v1.4.0', toRef: 'v1.5.0' }),
    ).toBe(`git log --max-count=1000 --pretty=format:'%s' 'v1.4.0..v1.5.0'`);
  });

  it('emits the subject-body template separated by --- markers', () => {
    expect(
      buildChangelogFromGitCommitsCommand({ fromRef: 'v1.0.0', format: 'subject-body' }),
    ).toBe(`git log --max-count=1000 --pretty=format:'%s%n%n%b%n---' 'v1.0.0..HEAD'`);
  });

  it('emits the oneline template with %h %s', () => {
    expect(
      buildChangelogFromGitCommitsCommand({ fromRef: 'abc1234', format: 'oneline' }),
    ).toBe(`git log --max-count=1000 --pretty=format:'%h %s' 'abc1234..HEAD'`);
  });

  it('honours an explicit maxCommits cap', () => {
    expect(
      buildChangelogFromGitCommitsCommand({ fromRef: 'v1.0.0', maxCommits: 25 }),
    ).toBe(`git log --max-count=25 --pretty=format:'%s' 'v1.0.0..HEAD'`);
  });

  it('falls back to the default cap when maxCommits is zero or negative', () => {
    const cmd = buildChangelogFromGitCommitsCommand({ fromRef: 'v1.0.0', maxCommits: 0 });
    expect(cmd).toContain('--max-count=1000');
  });

  it('throws when fromRef is missing', () => {
    expect(() => buildChangelogFromGitCommitsCommand({})).toThrow(/fromRef/);
  });

  it('throws when fromRef is empty/whitespace', () => {
    expect(() => buildChangelogFromGitCommitsCommand({ fromRef: '   ' })).toThrow(/fromRef/);
  });

  it('throws on an invalid format', () => {
    expect(() =>
      // @ts-expect-error testing the runtime guard
      buildChangelogFromGitCommitsCommand({ fromRef: 'v1.0.0', format: 'bogus' }),
    ).toThrow(/format/);
  });
});

import { describe, expect, it } from 'vitest';
import { buildEnsureGitStatusCleanCommand } from './ensureGitStatusClean';

describe('buildEnsureGitStatusCleanCommand', () => {
  it('produces the canonical porcelain probe', () => {
    expect(buildEnsureGitStatusCleanCommand({})).toBe('git status --porcelain');
  });

  it('ignores cwd — that field is plumbed through execMaybeRemote, not the command itself', () => {
    expect(buildEnsureGitStatusCleanCommand({ cwd: 'subdir' })).toBe('git status --porcelain');
  });

  it('ignores remote-host fields — those route via execMaybeRemote', () => {
    expect(
      buildEnsureGitStatusCleanCommand({ host: 'build@mac', identityFile: '~/.ssh/id_ed25519' }),
    ).toBe('git status --porcelain');
  });
});

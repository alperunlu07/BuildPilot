import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { __test__ } from './triggers';

const { extractGithubTrigger, extractGitlabTrigger, verifyHmacSha256 } = __test__;

describe('extractGithubTrigger', () => {
  it('parses a push payload into branch + sha', () => {
    const opts = extractGithubTrigger('push', {
      ref: 'refs/heads/main',
      head_commit: { id: 'abcdef1234' },
    });
    expect(opts).toEqual({ triggerBranch: 'main', triggerSha: 'abcdef1234' });
  });

  it('parses a pull_request opened/synchronize/reopened', () => {
    for (const action of ['opened', 'synchronize', 'reopened']) {
      const opts = extractGithubTrigger('pull_request', {
        action,
        pull_request: { head: { ref: 'feature/x', sha: 'fff' } },
      });
      expect(opts).toEqual({ triggerBranch: 'feature/x', triggerSha: 'fff' });
    }
  });

  it('ignores closed pull requests', () => {
    expect(
      extractGithubTrigger('pull_request', {
        action: 'closed',
        pull_request: { head: { ref: 'x', sha: 'y' } },
      }),
    ).toBeNull();
  });

  it('returns null for unhandled events', () => {
    expect(extractGithubTrigger('issues', {})).toBeNull();
  });
});

describe('extractGitlabTrigger', () => {
  it('parses object_kind=push', () => {
    const opts = extractGitlabTrigger({
      object_kind: 'push',
      ref: 'refs/heads/main',
      checkout_sha: 'abc',
    });
    expect(opts).toEqual({ triggerBranch: 'main', triggerSha: 'abc' });
  });

  it('parses object_kind=tag_push (strips refs/tags/)', () => {
    const opts = extractGitlabTrigger({
      object_kind: 'tag_push',
      ref: 'refs/tags/v1.4.0',
      checkout_sha: 'def',
    });
    expect(opts).toEqual({ triggerBranch: 'v1.4.0', triggerSha: 'def' });
  });

  it('ignores other object_kinds', () => {
    expect(extractGitlabTrigger({ object_kind: 'note' })).toBeNull();
  });
});

describe('verifyHmacSha256', () => {
  it('accepts when no secret configured', () => {
    expect(verifyHmacSha256(undefined, 'body', undefined).ok).toBe(true);
  });

  it('accepts a valid sha256= signature', () => {
    const secret = 'topsecret';
    const body = '{"hi":1}';
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(secret, body, sig, 'sha256=').ok).toBe(true);
  });

  it('rejects a mismatched signature', () => {
    const result = verifyHmacSha256('s', '{"hi":1}', 'sha256=deadbeef');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/mismatch/);
  });

  it('rejects when header missing but secret set', () => {
    expect(verifyHmacSha256('s', 'body', undefined).ok).toBe(false);
  });

  it('handles signature without prefix', () => {
    const secret = 's';
    const body = 'b';
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyHmacSha256(secret, body, sig, '').ok).toBe(true);
  });
});

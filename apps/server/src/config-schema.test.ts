import { describe, expect, it } from 'vitest';
import { ServerConfigSchema, formatValidationError } from './config-schema';

// Helper: turn a Zod success/failure into a flat list of error paths so
// assertions can pinpoint the offending field without re-implementing
// the formatter logic in every test.
function errorPaths(input: unknown): string[] {
  const r = ServerConfigSchema.safeParse(input);
  if (r.success) return [];
  return r.error.issues.map((i) => i.path.join('.'));
}

describe('ServerConfigSchema', () => {
  it('accepts a minimal valid config', () => {
    const cfg = {
      host: '127.0.0.1',
      port: 51731,
      pollIntervalSec: 60,
      dbPath: '/tmp/buildpilot/db.sqlite',
      webOrigin: 'http://127.0.0.1:51732',
    };
    const r = ServerConfigSchema.safeParse(cfg);
    expect(r.success).toBe(true);
  });

  it('accepts a full config with all optional blocks present', () => {
    const cfg = {
      host: '127.0.0.1',
      port: 51731,
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: null,
      telegram: { enabled: false, botToken: '', defaultChatId: '' },
      slack: { enabled: false, signingSecret: '', botToken: '', defaultChannel: '' },
      discord: { enabled: false, publicKey: '', applicationId: '', defaultChannelId: '' },
      buildRetentionDays: 30,
      auth: { enabled: false, sessionSecret: '' },
      githubOAuth: { clientId: 'abc', clientSecret: 'def' },
    };
    const r = ServerConfigSchema.safeParse(cfg);
    expect(r.success).toBe(true);
  });

  it('rejects a config missing required top-level fields', () => {
    const cfg = {
      // host omitted
      port: 51731,
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: 'http://127.0.0.1:51732',
    };
    expect(errorPaths(cfg)).toContain('host');
  });

  it('rejects wrong type for port (string instead of number)', () => {
    const cfg = {
      host: '127.0.0.1',
      port: '51731', // wrong: string
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: 'http://127.0.0.1:51732',
    };
    const paths = errorPaths(cfg);
    expect(paths).toContain('port');
  });

  it('rejects port out of TCP range', () => {
    const cfg = {
      host: '127.0.0.1',
      port: 99999, // out of 1-65535
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: 'http://127.0.0.1:51732',
    };
    const paths = errorPaths(cfg);
    expect(paths).toContain('port');
  });

  it('rejects unknown nested keys inside a notification block when type-mismatched', () => {
    // The notification blocks are .passthrough() so extra keys are ignored,
    // but the documented keys must still type-check. Misspelling "enabled"
    // as a string surfaces a clear path error.
    const cfg = {
      host: '127.0.0.1',
      port: 51731,
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: null,
      slack: {
        enabled: 'yes', // wrong: should be boolean
        signingSecret: '',
        botToken: '',
        defaultChannel: '',
      },
    };
    const paths = errorPaths(cfg);
    expect(paths).toContain('slack.enabled');
  });

  it('rejects telegram block with enabled=true but empty botToken', () => {
    const cfg = {
      host: '127.0.0.1',
      port: 51731,
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: null,
      telegram: {
        enabled: true,
        botToken: '',
        defaultChatId: '@chan',
      },
    };
    const paths = errorPaths(cfg);
    expect(paths).toContain('telegram.botToken');
  });

  it('produces a multi-line, actionable error message containing the offending value', () => {
    const cfg = {
      host: '127.0.0.1',
      port: 'not-a-number',
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: 'http://127.0.0.1:51732',
    };
    const r = ServerConfigSchema.safeParse(cfg);
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = formatValidationError(r.error, cfg);
      expect(msg).toContain('port');
      expect(msg).toContain('"not-a-number"');
      expect(msg).toContain('~/.buildpilot/config.json');
    }
  });

  it('ignores unknown top-level keys for forward compatibility', () => {
    const cfg = {
      host: '127.0.0.1',
      port: 51731,
      pollIntervalSec: 60,
      dbPath: '/tmp/x.sqlite',
      webOrigin: null,
      // future field a newer build introduced — shouldn't break an older
      // server reading the same file.
      futureFeatureFlag: true,
      experimentalRouting: { mode: 'cool' },
    };
    const r = ServerConfigSchema.safeParse(cfg);
    expect(r.success).toBe(true);
  });
});

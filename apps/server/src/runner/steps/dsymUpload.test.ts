import { describe, expect, it } from 'vitest';
import {
  buildBugsnagCommand,
  buildCrashlyticsCommand,
  buildDsymUploadCommand,
  buildSentryCommand,
} from './dsymUpload';

describe('buildCrashlyticsCommand', () => {
  it('builds the canonical upload-symbols invocation', () => {
    const cmd = buildCrashlyticsCommand({
      googleServicePlistPath: 'GoogleService-Info.plist',
      dsymPath: 'build/MyGame.xcarchive',
      platform: 'ios',
    });
    expect(cmd).toBe(
      `'upload-symbols' -gsp 'GoogleService-Info.plist' -p ios 'build/MyGame.xcarchive'`,
    );
  });

  it('uses a custom uploadSymbolsBinary when provided', () => {
    const cmd = buildCrashlyticsCommand({
      googleServicePlistPath: 'gsp.plist',
      dsymPath: 'a.xcarchive',
      uploadSymbolsBinary: '/Pods/FirebaseCrashlytics/upload-symbols',
    });
    expect(cmd.startsWith(`'/Pods/FirebaseCrashlytics/upload-symbols' -gsp 'gsp.plist'`)).toBe(true);
  });

  it('throws when googleServicePlistPath is missing', () => {
    expect(() => buildCrashlyticsCommand({ dsymPath: 'a' })).toThrow(/googleServicePlistPath/);
  });
});

describe('buildSentryCommand', () => {
  it('prefixes SENTRY_AUTH_TOKEN when set', () => {
    const cmd = buildSentryCommand({
      sentryOrg: 'team',
      sentryProject: 'app',
      sentryAuthToken: 't0k3n',
      dsymPath: 'a.dSYM',
    });
    expect(cmd.startsWith(`SENTRY_AUTH_TOKEN='t0k3n' sentry-cli debug-files upload`)).toBe(true);
    expect(cmd).toContain(`--org 'team'`);
    expect(cmd).toContain(`--project 'app'`);
    expect(cmd).toContain(`'a.dSYM'`);
  });

  it('omits the env prefix when no auth token is supplied', () => {
    const cmd = buildSentryCommand({
      sentryOrg: 'team',
      sentryProject: 'app',
      dsymPath: 'a.dSYM',
    });
    expect(cmd).not.toContain('SENTRY_AUTH_TOKEN');
    expect(cmd.startsWith('sentry-cli')).toBe(true);
  });

  it('throws when sentryOrg is missing', () => {
    expect(() =>
      buildSentryCommand({ sentryProject: 'p', dsymPath: 'a' }),
    ).toThrow(/sentryOrg/);
  });
});

describe('buildBugsnagCommand', () => {
  it('builds the canonical bugsnag-cli invocation', () => {
    const cmd = buildBugsnagCommand({
      bugsnagApiKey: 'abcdef0123456789',
      dsymPath: 'a.xcarchive',
    });
    expect(cmd).toBe(
      `'bugsnag-cli' upload xcode-archive --api-key 'abcdef0123456789' 'a.xcarchive'`,
    );
  });

  it('honours bugsnagCliPath override', () => {
    const cmd = buildBugsnagCommand({
      bugsnagApiKey: 'k',
      bugsnagCliPath: './bin/bugsnag-cli',
      dsymPath: 'a.xcarchive',
    });
    expect(cmd.startsWith(`'./bin/bugsnag-cli' upload xcode-archive`)).toBe(true);
  });

  it('throws when bugsnagApiKey is missing', () => {
    expect(() => buildBugsnagCommand({ dsymPath: 'a' })).toThrow(/bugsnagApiKey/);
  });
});

describe('buildDsymUploadCommand (dispatch)', () => {
  it('routes to the right per-backend builder', () => {
    expect(
      buildDsymUploadCommand({
        backend: 'sentry',
        sentryOrg: 'o',
        sentryProject: 'p',
        dsymPath: 'a',
      }),
    ).toContain('sentry-cli');
    expect(
      buildDsymUploadCommand({
        backend: 'bugsnag',
        bugsnagApiKey: 'k',
        dsymPath: 'a',
      }),
    ).toContain('bugsnag-cli');
    expect(
      buildDsymUploadCommand({
        backend: 'crashlytics',
        googleServicePlistPath: 'g',
        dsymPath: 'a',
      }),
    ).toContain('upload-symbols');
  });

  it('throws on a missing or invalid backend', () => {
    expect(() => buildDsymUploadCommand({ dsymPath: 'a' })).toThrow(/backend/);
    // @ts-expect-error testing the runtime guard
    expect(() => buildDsymUploadCommand({ backend: 'wrong', dsymPath: 'a' })).toThrow(/backend/);
  });
});

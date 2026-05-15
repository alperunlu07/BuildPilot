import { describe, expect, it } from 'vitest';
import {
  buildBugsnagCommand,
  buildCrashlyticsCommand,
  buildDatadogCommand,
  buildDsymUploadCommand,
  buildEmbraceCommand,
  buildInstabugCommand,
  buildNewRelicCommand,
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

describe('buildDatadogCommand', () => {
  it('puts DATADOG_API_KEY in the env prefix, never on argv', () => {
    const cmd = buildDatadogCommand({
      datadogApiKey: 'dd-key',
      dsymPath: 'a.xcarchive',
    });
    expect(cmd.startsWith(`DATADOG_API_KEY='dd-key' `)).toBe(true);
    expect(cmd).toContain(`'datadog-ci' dsyms upload 'a.xcarchive'`);
  });

  it('includes DATADOG_SITE when datadogSite is provided', () => {
    const cmd = buildDatadogCommand({
      datadogApiKey: 'k',
      datadogSite: 'datadoghq.eu',
      dsymPath: 'a',
    });
    expect(cmd).toContain(`DATADOG_SITE='datadoghq.eu'`);
  });

  it('honours datadogCliPath override', () => {
    const cmd = buildDatadogCommand({
      datadogApiKey: 'k',
      datadogCliPath: './bin/datadog-ci',
      dsymPath: 'a',
    });
    expect(cmd).toContain(`'./bin/datadog-ci' dsyms upload`);
  });

  it('throws when datadogApiKey is missing', () => {
    expect(() => buildDatadogCommand({ dsymPath: 'a' })).toThrow(/datadogApiKey/);
  });
});

describe('buildInstabugCommand', () => {
  it('invokes Instabug_dsym_upload.sh with token + path', () => {
    const cmd = buildInstabugCommand({
      instabugAppToken: 't0k',
      dsymPath: 'a.xcarchive',
    });
    expect(cmd).toContain(`INSTABUG_APP_TOKEN='t0k'`);
    expect(cmd).toContain(`'Instabug_dsym_upload.sh' 't0k' 'a.xcarchive'`);
  });

  it('honours instabugScriptPath override', () => {
    const cmd = buildInstabugCommand({
      instabugAppToken: 't',
      instabugScriptPath: '/opt/instabug/upload.sh',
      dsymPath: 'a',
    });
    expect(cmd).toContain(`'/opt/instabug/upload.sh' 't' 'a'`);
  });

  it('throws when instabugAppToken is missing', () => {
    expect(() => buildInstabugCommand({ dsymPath: 'a' })).toThrow(/instabugAppToken/);
  });
});

describe('buildEmbraceCommand', () => {
  it('builds the canonical embrace_symbol_upload.darwin invocation', () => {
    const cmd = buildEmbraceCommand({
      embraceAppId: 'app-1',
      embraceApiToken: 'tok',
      dsymPath: 'a.xcarchive',
    });
    expect(cmd).toBe(
      `'embrace_symbol_upload.darwin' --app 'app-1' --token 'tok' 'a.xcarchive'`,
    );
  });

  it('honours embraceUploadPath override', () => {
    const cmd = buildEmbraceCommand({
      embraceAppId: 'a',
      embraceApiToken: 't',
      embraceUploadPath: './bin/embrace',
      dsymPath: 'd',
    });
    expect(cmd.startsWith(`'./bin/embrace' --app 'a'`)).toBe(true);
  });

  it('throws when embraceAppId is missing', () => {
    expect(() => buildEmbraceCommand({ embraceApiToken: 't', dsymPath: 'a' })).toThrow(
      /embraceAppId/,
    );
  });

  it('throws when embraceApiToken is missing', () => {
    expect(() => buildEmbraceCommand({ embraceAppId: 'a', dsymPath: 'd' })).toThrow(
      /embraceApiToken/,
    );
  });
});

describe('buildNewRelicCommand', () => {
  it('builds the canonical newrelic-ios-symbol-upload invocation', () => {
    const cmd = buildNewRelicCommand({
      newrelicAppToken: 'nr-tok',
      dsymPath: 'a.xcarchive',
    });
    expect(cmd).toBe(`'newrelic-ios-symbol-upload' 'nr-tok' 'a.xcarchive'`);
  });

  it('honours newrelicCliPath override', () => {
    const cmd = buildNewRelicCommand({
      newrelicAppToken: 't',
      newrelicCliPath: './bin/nr-upload',
      dsymPath: 'd',
    });
    expect(cmd.startsWith(`'./bin/nr-upload' 't' 'd'`)).toBe(true);
  });

  it('throws when newrelicAppToken is missing', () => {
    expect(() => buildNewRelicCommand({ dsymPath: 'a' })).toThrow(/newrelicAppToken/);
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
    expect(
      buildDsymUploadCommand({
        backend: 'datadog',
        datadogApiKey: 'k',
        dsymPath: 'a',
      }),
    ).toContain('datadog-ci');
    expect(
      buildDsymUploadCommand({
        backend: 'instabug',
        instabugAppToken: 't',
        dsymPath: 'a',
      }),
    ).toContain('Instabug_dsym_upload.sh');
    expect(
      buildDsymUploadCommand({
        backend: 'embrace',
        embraceAppId: 'a',
        embraceApiToken: 't',
        dsymPath: 'd',
      }),
    ).toContain('embrace_symbol_upload.darwin');
    expect(
      buildDsymUploadCommand({
        backend: 'newrelic',
        newrelicAppToken: 't',
        dsymPath: 'a',
      }),
    ).toContain('newrelic-ios-symbol-upload');
  });

  it('throws on a missing or invalid backend', () => {
    expect(() => buildDsymUploadCommand({ dsymPath: 'a' })).toThrow(/backend/);
    // @ts-expect-error testing the runtime guard
    expect(() => buildDsymUploadCommand({ backend: 'wrong', dsymPath: 'a' })).toThrow(/backend/);
  });
});

import { describe, expect, it } from 'vitest';
import { buildFirebaseDistributionCommand } from './firebaseAppDistribution';

describe('buildFirebaseDistributionCommand', () => {
  it('throws on missing required fields', () => {
    expect(() => buildFirebaseDistributionCommand({})).toThrow(/appId/);
    expect(() => buildFirebaseDistributionCommand({ appId: 'x' })).toThrow(/binaryPath/);
  });

  it('builds the canonical distribute command', () => {
    const cmd = buildFirebaseDistributionCommand({
      appId: '1:1234567890:ios:abcdef',
      binaryPath: 'build/MyApp.ipa',
      groups: 'qa,internal',
      releaseNotes: 'Bug fixes',
    });
    expect(cmd).toContain(`firebase appdistribution:distribute 'build/MyApp.ipa'`);
    expect(cmd).toContain(`--app '1:1234567890:ios:abcdef'`);
    expect(cmd).toContain(`--groups 'qa,internal'`);
    expect(cmd).toContain(`--release-notes 'Bug fixes'`);
  });

  it('exposes service-account path via env prefix', () => {
    const cmd = buildFirebaseDistributionCommand({
      appId: 'a',
      binaryPath: 'b.ipa',
      serviceAccountPath: '~/.gcp/sa.json',
    });
    expect(cmd).toMatch(/^GOOGLE_APPLICATION_CREDENTIALS='~\/\.gcp\/sa\.json' firebase /);
  });

  it('release-notes-file overrides inline notes', () => {
    const cmd = buildFirebaseDistributionCommand({
      appId: 'a',
      binaryPath: 'b.ipa',
      releaseNotesFile: 'CHANGELOG.md',
    });
    expect(cmd).toContain(`--release-notes-file 'CHANGELOG.md'`);
  });
});

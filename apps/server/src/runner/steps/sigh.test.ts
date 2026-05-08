import { describe, expect, it } from 'vitest';
import { buildSighCommand } from './sigh';

describe('buildSighCommand', () => {
  it('throws on invalid action', () => {
    expect(() => buildSighCommand({ action: 'huh' as never })).toThrow(/action/);
  });

  it('throws on invalid profileType', () => {
    expect(() => buildSighCommand({ profileType: 'wat' as never })).toThrow(/profileType/);
  });

  it('downloads an appstore profile by default', () => {
    expect(buildSighCommand({})).toBe('fastlane sigh download');
  });

  it('renew with --force', () => {
    const cmd = buildSighCommand({ action: 'renew', force: 'true' });
    expect(cmd).toBe('fastlane sigh renew --force');
  });

  it('passes through targeting and uses correct profile-type flag', () => {
    const cmd = buildSighCommand({
      action: 'renew',
      profileType: 'adhoc',
      appIdentifier: 'com.example.app',
      username: 'dev@example.com',
      teamId: 'AB12CDE34F',
      force: 'true',
      outputPath: 'profiles/',
    });
    expect(cmd).toContain(`--app_identifier 'com.example.app'`);
    expect(cmd).toContain(`--username 'dev@example.com'`);
    expect(cmd).toContain(`--team_id 'AB12CDE34F'`);
    expect(cmd).toContain('--adhoc');
    expect(cmd).toContain('--force');
    expect(cmd).toContain(`--output_path 'profiles/'`);
  });

  it('manage action does not append --force even with force=true (manage uses --nuke pattern)', () => {
    const cmd = buildSighCommand({ action: 'manage', force: 'true' });
    expect(cmd).not.toContain('--force');
  });

  it('skipInstall + platform', () => {
    const cmd = buildSighCommand({ skipInstall: 'true', platform: 'tvos' });
    expect(cmd).toContain('--skip_install true');
    expect(cmd).toContain(`--platform 'tvos'`);
  });
});

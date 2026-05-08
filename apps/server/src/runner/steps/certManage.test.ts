import { describe, expect, it } from 'vitest';
import { buildCertManageCommand } from './certManage';

describe('buildCertManageCommand', () => {
  it('builds a bare invocation (production cert, no targeting)', () => {
    expect(buildCertManageCommand({})).toBe('fastlane cert');
  });

  it('switches to development with --development true', () => {
    expect(buildCertManageCommand({ development: 'true' })).toContain('--development true');
  });

  it('passes through targeting flags', () => {
    const cmd = buildCertManageCommand({
      appIdentifier: 'com.example.app',
      username: 'dev@example.com',
      teamId: 'AB12CDE34F',
      outputPath: 'certs/',
      keychainPath: 'login.keychain-db',
      keychainPassword: 'kpw',
      platform: 'macos',
    });
    expect(cmd).toContain(`--app_identifier 'com.example.app'`);
    expect(cmd).toContain(`--username 'dev@example.com'`);
    expect(cmd).toContain(`--team_id 'AB12CDE34F'`);
    expect(cmd).toContain(`--output_path 'certs/'`);
    expect(cmd).toContain(`--keychain_path 'login.keychain-db'`);
    expect(cmd).toContain(`--keychain_password 'kpw'`);
    expect(cmd).toContain(`--platform 'macos'`);
  });
});

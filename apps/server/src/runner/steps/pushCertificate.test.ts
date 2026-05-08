import { describe, expect, it } from 'vitest';
import { buildPushCertificateCommand } from './pushCertificate';

describe('buildPushCertificateCommand', () => {
  it('throws on missing appIdentifier', () => {
    expect(() => buildPushCertificateCommand({})).toThrow(/appIdentifier/);
  });

  it('builds the canonical production-pem invocation', () => {
    const cmd = buildPushCertificateCommand({ appIdentifier: 'com.example.app' });
    expect(cmd).toBe(`fastlane pem --app_identifier 'com.example.app'`);
  });

  it('switches to development cert when requested', () => {
    const cmd = buildPushCertificateCommand({
      appIdentifier: 'com.example.app',
      development: 'true',
      force: 'true',
    });
    expect(cmd).toContain('--development true');
    expect(cmd).toContain('--force true');
  });

  it('disables p12 generation when generateP12=false', () => {
    const cmd = buildPushCertificateCommand({ appIdentifier: 'a', generateP12: 'false' });
    expect(cmd).toContain('--generate_p12 false');
  });

  it('includes p12 password + output path + activeDaysLimit', () => {
    const cmd = buildPushCertificateCommand({
      appIdentifier: 'a',
      password: 'secret',
      outputPath: 'certs/',
      activeDaysLimit: 14,
    });
    expect(cmd).toContain(`--p12_password 'secret'`);
    expect(cmd).toContain(`--output_path 'certs/'`);
    expect(cmd).toContain(`--active_days_limit '14'`);
  });
});

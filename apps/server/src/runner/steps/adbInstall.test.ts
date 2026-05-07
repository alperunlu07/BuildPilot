import { describe, expect, it } from 'vitest';
import { buildAdbInstallArgs } from './adbInstall';

describe('buildAdbInstallArgs', () => {
  it('emits "install -r <apk>" by default', () => {
    expect(buildAdbInstallArgs({}, '/abs/app.apk')).toEqual(['install', '-r', '/abs/app.apk']);
  });

  it('drops -r when replace=false', () => {
    expect(buildAdbInstallArgs({ replace: 'false' }, '/abs/app.apk')).toEqual([
      'install',
      '/abs/app.apk',
    ]);
  });

  it('adds -d when allowDowngrade=true', () => {
    const args = buildAdbInstallArgs({ allowDowngrade: 'true' }, '/abs/app.apk');
    expect(args).toContain('-d');
  });

  it('adds -t when allowTest=true', () => {
    const args = buildAdbInstallArgs({ allowTest: 'true' }, '/abs/app.apk');
    expect(args).toContain('-t');
  });

  it('prefixes -s <serial> before "install" when serial is set', () => {
    const args = buildAdbInstallArgs({ serial: 'emulator-5554' }, '/abs/app.apk');
    expect(args.slice(0, 3)).toEqual(['-s', 'emulator-5554', 'install']);
  });

  it('omits -s when serial is blank', () => {
    const args = buildAdbInstallArgs({ serial: '   ' }, '/abs/app.apk');
    expect(args).not.toContain('-s');
  });

  it('apk path is the trailing positional', () => {
    const args = buildAdbInstallArgs(
      { serial: 'X', allowDowngrade: 'true', allowTest: 'true' },
      '/abs/app.apk',
    );
    expect(args[args.length - 1]).toBe('/abs/app.apk');
  });
});

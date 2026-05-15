import { describe, expect, it } from 'vitest';
import { buildBundletoolArgs } from './bundletool';

describe('buildBundletoolArgs - build-apks', () => {
  it('emits --bundle / --output from bundlePath + apksPath', () => {
    const args = buildBundletoolArgs({
      action: 'build-apks',
      bundlePath: 'app/build/outputs/bundle/release/app.aab',
      apksPath: 'build/app.apks',
    });
    expect(args).toEqual([
      'build-apks',
      '--bundle=app/build/outputs/bundle/release/app.aab',
      '--output=build/app.apks',
    ]);
  });

  it('adds --mode=universal when universalMode=true', () => {
    const args = buildBundletoolArgs({
      bundlePath: 'a.aab',
      apksPath: 'a.apks',
      universalMode: 'true',
    });
    expect(args).toContain('--mode=universal');
  });

  it('emits signing flags only when keystorePath is set', () => {
    const args = buildBundletoolArgs({
      bundlePath: 'a.aab',
      apksPath: 'a.apks',
      keystorePath: 'release.keystore',
      androidKeystorePassword: 'ksPass',
      keyAlias: 'upload',
      androidKeyPassword: 'kPass',
    });
    expect(args).toContain('--ks=release.keystore');
    expect(args).toContain('--ks-pass=pass:ksPass');
    expect(args).toContain('--ks-key-alias=upload');
    expect(args).toContain('--key-pass=pass:kPass');
  });

  it('omits all signing flags when keystorePath is blank', () => {
    const args = buildBundletoolArgs({ bundlePath: 'a.aab', apksPath: 'a.apks' });
    expect(args.join(' ')).not.toMatch(/--ks/);
  });

  it('appends additionalArgs split on whitespace', () => {
    const args = buildBundletoolArgs({
      bundlePath: 'a.aab',
      apksPath: 'a.apks',
      additionalArgs: '--connected-device --aapt2 path/to/aapt2',
    });
    expect(args).toContain('--connected-device');
    expect(args).toContain('--aapt2');
    expect(args).toContain('path/to/aapt2');
  });

  it('throws when bundlePath is missing on build-apks', () => {
    expect(() => buildBundletoolArgs({ apksPath: 'a.apks' })).toThrow(/bundlePath/);
  });

  it('throws when apksPath is missing', () => {
    expect(() =>
      buildBundletoolArgs({ action: 'build-apks', bundlePath: 'a.aab' }),
    ).toThrow(/apksPath/);
  });
});

describe('buildBundletoolArgs - install-apks', () => {
  it('emits --apks from apksPath', () => {
    expect(
      buildBundletoolArgs({ action: 'install-apks', apksPath: 'build/app.apks' }),
    ).toEqual(['install-apks', '--apks=build/app.apks']);
  });

  it('passes --device-id when serial is set', () => {
    const args = buildBundletoolArgs({
      action: 'install-apks',
      apksPath: 'a.apks',
      serial: 'emulator-5554',
    });
    expect(args).toContain('--device-id=emulator-5554');
  });
});

describe('buildBundletoolArgs - validation', () => {
  it('throws on an unknown action', () => {
    expect(() =>
      // @ts-expect-error testing the runtime guard
      buildBundletoolArgs({ action: 'wrong', apksPath: 'a.apks' }),
    ).toThrow(/action/);
  });
});

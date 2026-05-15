import { describe, expect, it } from 'vitest';
import { buildAndroidSignInvocation } from './androidSign';

describe('androidSign — sign', () => {
  it('uses apksigner sign with --ks / --ks-pass / apkPath positional', () => {
    const { bin, args } = buildAndroidSignInvocation({
      apkPath: 'app-release.apk',
      keystorePath: 'release.jks',
      androidKeystorePassword: 'ksPass',
      keyAlias: 'upload',
      androidKeyPassword: 'kPass',
    });
    expect(bin).toBe('apksigner');
    expect(args[0]).toBe('sign');
    expect(args).toContain('--ks');
    expect(args).toContain('release.jks');
    expect(args).toContain('--ks-pass');
    expect(args).toContain('pass:ksPass');
    expect(args).toContain('--ks-key-alias');
    expect(args).toContain('upload');
    expect(args).toContain('--key-pass');
    expect(args).toContain('pass:kPass');
    expect(args[args.length - 1]).toBe('app-release.apk');
  });

  it('toggles --vN-signing-enabled flags only when set', () => {
    const { args } = buildAndroidSignInvocation({
      apkPath: 'a.apk',
      keystorePath: 'k.jks',
      androidKeystorePassword: 'p',
      v1: 'true',
      v2: 'false',
    });
    expect(args).toContain('--v1-signing-enabled=true');
    expect(args).toContain('--v2-signing-enabled=false');
    expect(args.find((a) => a.startsWith('--v3-'))).toBeUndefined();
  });

  it('respects apksignerPath override', () => {
    const { bin } = buildAndroidSignInvocation({
      apkPath: 'a.apk',
      keystorePath: 'k',
      androidKeystorePassword: 'p',
      apksignerPath: '$ANDROID_HOME/build-tools/34.0.0/apksigner',
    });
    expect(bin).toBe('$ANDROID_HOME/build-tools/34.0.0/apksigner');
  });

  it('uses --out for separate output paths', () => {
    const { args } = buildAndroidSignInvocation({
      apkPath: 'unsigned.apk',
      outputPath: 'signed.apk',
      keystorePath: 'k',
      androidKeystorePassword: 'p',
    });
    expect(args).toContain('--out');
    expect(args).toContain('signed.apk');
  });

  it('records the secret values for log redaction', () => {
    const { redactValues } = buildAndroidSignInvocation({
      apkPath: 'a.apk',
      keystorePath: 'k',
      androidKeystorePassword: 's3cret',
      androidKeyPassword: 'k3yP@ss',
    });
    expect(redactValues).toEqual(['s3cret', 'k3yP@ss']);
  });

  it('throws when keystorePath is missing', () => {
    expect(() =>
      buildAndroidSignInvocation({ apkPath: 'a', androidKeystorePassword: 'p' }),
    ).toThrow(/keystorePath/);
  });

  it('throws when androidKeystorePassword is missing', () => {
    expect(() =>
      buildAndroidSignInvocation({ apkPath: 'a', keystorePath: 'k' }),
    ).toThrow(/androidKeystorePassword/);
  });
});

describe('androidSign — verify', () => {
  it('uses apksigner verify with --verbose and the apk positional', () => {
    const { bin, args } = buildAndroidSignInvocation({
      action: 'verify',
      apkPath: 'release.apk',
    });
    expect(bin).toBe('apksigner');
    expect(args).toEqual(['verify', '--verbose', 'release.apk']);
  });
});

describe('androidSign — jarsign', () => {
  it('uses jarsigner with -keystore / -storepass / alias positional', () => {
    const { bin, args } = buildAndroidSignInvocation({
      action: 'jarsign',
      apkPath: 'app.apk',
      keystorePath: 'legacy.keystore',
      androidKeystorePassword: 'sp',
      keyAlias: 'upload',
    });
    expect(bin).toBe('jarsigner');
    expect(args).toContain('-keystore');
    expect(args).toContain('legacy.keystore');
    expect(args).toContain('-storepass');
    expect(args).toContain('sp');
    expect(args[args.length - 2]).toBe('app.apk');
    expect(args[args.length - 1]).toBe('upload');
  });

  it('honours jarsignerPath override', () => {
    const { bin } = buildAndroidSignInvocation({
      action: 'jarsign',
      apkPath: 'a',
      keystorePath: 'k',
      androidKeystorePassword: 'p',
      jarsignerPath: '/opt/jdk-17/bin/jarsigner',
    });
    expect(bin).toBe('/opt/jdk-17/bin/jarsigner');
  });
});

describe('androidSign — validation', () => {
  it('throws on an invalid action', () => {
    expect(() =>
      // @ts-expect-error testing the runtime guard
      buildAndroidSignInvocation({ action: 'wrong', apkPath: 'a' }),
    ).toThrow(/action/);
  });

  it('throws when apkPath is missing', () => {
    expect(() => buildAndroidSignInvocation({})).toThrow(/apkPath/);
  });
});

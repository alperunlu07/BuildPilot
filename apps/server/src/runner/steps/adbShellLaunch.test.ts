import { describe, expect, it } from 'vitest';
import { buildAdbLaunchArgs } from './adbShellLaunch';

describe('buildAdbLaunchArgs', () => {
  it('builds am start with "<pkg>/.<Activity>" when activity starts with a dot', () => {
    const args = buildAdbLaunchArgs({
      packageName: 'com.example.app',
      activity: '.MainActivity',
    });
    expect(args).toEqual([
      'shell',
      'am',
      'start',
      '-n',
      'com.example.app/.MainActivity',
    ]);
  });

  it('passes a fully-qualified activity unchanged after the slash', () => {
    const args = buildAdbLaunchArgs({
      packageName: 'com.example.app',
      activity: 'com.example.app.MainActivity',
    });
    expect(args[args.length - 1]).toBe('com.example.app/com.example.app.MainActivity');
  });

  it('treats a bare class name (no dots) as relative — prefixes with .', () => {
    const args = buildAdbLaunchArgs({
      packageName: 'com.example.app',
      activity: 'MainActivity',
    });
    expect(args[args.length - 1]).toBe('com.example.app/.MainActivity');
  });

  it('uses monkey when activity is blank', () => {
    const args = buildAdbLaunchArgs({ packageName: 'com.example.app' });
    expect(args).toContain('monkey');
    expect(args).toContain('-p');
    expect(args).toContain('com.example.app');
    expect(args).toContain('android.intent.category.LAUNCHER');
  });

  it('inserts -W when waitForLaunch=true', () => {
    const args = buildAdbLaunchArgs({
      packageName: 'com.example.app',
      activity: '.MainActivity',
      waitForLaunch: 'true',
    });
    expect(args).toContain('-W');
  });

  it('prefixes -s <serial> when set', () => {
    const args = buildAdbLaunchArgs({
      packageName: 'com.example.app',
      activity: '.MainActivity',
      serial: 'emulator-5554',
    });
    expect(args.slice(0, 3)).toEqual(['-s', 'emulator-5554', 'shell']);
  });

  it('throws when packageName is missing', () => {
    expect(() => buildAdbLaunchArgs({})).toThrow(/packageName/);
  });
});

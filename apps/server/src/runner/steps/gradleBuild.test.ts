import { describe, expect, it } from 'vitest';
import { buildGradleArgs } from './gradleBuild';

describe('buildGradleArgs', () => {
  it('produces assemble<Variant> for output=apk', () => {
    expect(buildGradleArgs({ output: 'apk', variant: 'Release', module: ':app' })).toEqual([
      ':app:assembleRelease',
    ]);
  });

  it('produces bundle<Variant> for output=aab', () => {
    expect(buildGradleArgs({ output: 'aab', variant: 'Release', module: ':app' })).toEqual([
      ':app:bundleRelease',
    ]);
  });

  it('defaults variant to Release when blank', () => {
    expect(buildGradleArgs({ output: 'apk', module: ':app' })).toEqual([':app:assembleRelease']);
  });

  it('defaults module to :app when undefined', () => {
    expect(buildGradleArgs({ output: 'apk' })).toEqual([':app:assembleRelease']);
  });

  it('drops the leading module path when module is an empty string', () => {
    // Root-project gradle layouts (no app/) want a bare assembleRelease.
    expect(buildGradleArgs({ output: 'apk', module: '' })).toEqual(['assembleRelease']);
  });

  it('passes a custom task verbatim', () => {
    expect(
      buildGradleArgs({ output: 'custom', gradleTask: ':app:assembleStagingDebug' }),
    ).toEqual([':app:assembleStagingDebug']);
  });

  it('throws when output=custom and gradleTask is missing', () => {
    expect(() => buildGradleArgs({ output: 'custom' })).toThrow(/gradleTask/);
  });

  it('appends gradleArgs split on whitespace', () => {
    const args = buildGradleArgs({
      output: 'apk',
      gradleArgs: '--info --no-daemon',
    });
    expect(args).toContain('--info');
    expect(args).toContain('--no-daemon');
  });

  it('preserves variant case (gradle is case-sensitive)', () => {
    expect(buildGradleArgs({ output: 'apk', variant: 'StagingDebug' })).toEqual([
      ':app:assembleStagingDebug',
    ]);
  });
});

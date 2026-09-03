import { describe, expect, it } from 'vitest';
import { resolvePromoteInputs } from './playConsolePromote';

const BASE = { packageName: 'com.example.app', versionCode: 18, track: 'beta' };

describe('resolvePromoteInputs', () => {
  it('defaults status to completed and carries the version code through', () => {
    const r = resolvePromoteInputs(BASE);
    expect(r.versionCode).toBe(18);
    expect(r.track).toBe('beta');
    expect(r.status).toBe('completed');
    expect(r.userFraction).toBeUndefined();
  });

  it('accepts a version code that arrived from the form as a string', () => {
    const r = resolvePromoteInputs({ ...BASE, versionCode: '18' as unknown as number });
    expect(r.versionCode).toBe(18);
  });

  it('rejects a missing, zero, or non-integer version code', () => {
    expect(() => resolvePromoteInputs({ ...BASE, versionCode: undefined })).toThrow(/versionCode/);
    expect(() => resolvePromoteInputs({ ...BASE, versionCode: 0 })).toThrow(/versionCode/);
    expect(() => resolvePromoteInputs({ ...BASE, versionCode: 1.5 })).toThrow(/versionCode/);
  });

  // Promoting picks who receives the build, so there is deliberately no
  // default track — a silent one would either look like a no-op or publish to
  // the wrong audience.
  it('requires an explicit, valid track', () => {
    expect(() => resolvePromoteInputs({ ...BASE, track: undefined })).toThrow(/track/);
    expect(() => resolvePromoteInputs({ ...BASE, track: 'nightly' })).toThrow(/invalid track/);
  });

  it('normalises track casing', () => {
    expect(resolvePromoteInputs({ ...BASE, track: 'Production' }).track).toBe('production');
  });

  it('requires userFraction in (0, 1] when status is inProgress', () => {
    expect(() => resolvePromoteInputs({ ...BASE, status: 'inProgress' })).toThrow(/userFraction/);
    expect(() =>
      resolvePromoteInputs({ ...BASE, status: 'inProgress', userFraction: 0 }),
    ).toThrow(/userFraction/);
    expect(() =>
      resolvePromoteInputs({ ...BASE, status: 'inProgress', userFraction: 1.5 }),
    ).toThrow(/userFraction/);
    expect(resolvePromoteInputs({ ...BASE, status: 'inProgress', userFraction: 0.2 }).userFraction).toBe(
      0.2,
    );
  });

  // userFraction is only meaningful for a staged rollout; carrying it into a
  // completed release would have Play reject the track update.
  it('drops userFraction for non-staged statuses', () => {
    expect(
      resolvePromoteInputs({ ...BASE, status: 'completed', userFraction: 0.5 }).userFraction,
    ).toBeUndefined();
  });

  it('rejects an unknown status', () => {
    expect(() => resolvePromoteInputs({ ...BASE, status: 'published' })).toThrow(/invalid status/);
  });

  it('parses release notes and keeps an explicit release name', () => {
    const r = resolvePromoteInputs({
      ...BASE,
      releaseName: ' 0.0.45 ',
      releaseNotes: 'en-US=Bug fixes\ntr-TR=Hata düzeltmeleri',
    });
    expect(r.releaseName).toBe('0.0.45');
    expect(r.releaseNotes).toEqual([
      { language: 'en-US', text: 'Bug fixes' },
      { language: 'tr-TR', text: 'Hata düzeltmeleri' },
    ]);
  });

  it('requires a package name', () => {
    expect(() => resolvePromoteInputs({ ...BASE, packageName: '  ' })).toThrow(/packageName/);
  });
});

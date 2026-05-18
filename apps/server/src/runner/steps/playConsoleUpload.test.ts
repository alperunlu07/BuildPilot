import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePlayInputs } from './playConsoleUpload';

describe('resolvePlayInputs', () => {
  it('classifies .aab vs .apk correctly', () => {
    const r1 = resolvePlayInputs(
      { packageName: 'com.example.app', binaryPath: 'a.aab' },
      '/proj',
    );
    expect(r1.binaryKind).toBe('aab');
    expect(r1.binaryAbs).toBe(join('/proj', 'a.aab'));
    const r2 = resolvePlayInputs(
      { packageName: 'com.example.app', binaryPath: '/abs/a.apk' },
      '/proj',
    );
    expect(r2.binaryKind).toBe('apk');
    expect(r2.binaryAbs).toBe('/abs/a.apk');
  });

  it('defaults track=internal and status=completed', () => {
    const r = resolvePlayInputs(
      { packageName: 'com.example.app', binaryPath: 'a.aab' },
      '/proj',
    );
    expect(r.track).toBe('internal');
    expect(r.status).toBe('completed');
    expect(r.userFraction).toBeUndefined();
  });

  it('parses release notes when supplied', () => {
    const r = resolvePlayInputs(
      {
        packageName: 'p',
        binaryPath: 'a.aab',
        releaseNotes: 'en-US=Hello\ntr-TR=Merhaba',
      },
      '/proj',
    );
    expect(r.releaseNotes).toEqual([
      { language: 'en-US', text: 'Hello' },
      { language: 'tr-TR', text: 'Merhaba' },
    ]);
  });

  it('rejects unknown tracks', () => {
    expect(() =>
      resolvePlayInputs(
        { packageName: 'p', binaryPath: 'a.aab', track: 'preview' },
        '/proj',
      ),
    ).toThrow(/track/);
  });

  it('rejects unknown statuses', () => {
    expect(() =>
      resolvePlayInputs(
        { packageName: 'p', binaryPath: 'a.aab', status: 'rolledOut' },
        '/proj',
      ),
    ).toThrow(/status/);
  });

  it('demands userFraction when status=inProgress', () => {
    expect(() =>
      resolvePlayInputs(
        { packageName: 'p', binaryPath: 'a.aab', status: 'inProgress' },
        '/proj',
      ),
    ).toThrow(/userFraction/);
  });

  it('accepts userFraction in (0, 1]', () => {
    const r = resolvePlayInputs(
      {
        packageName: 'p',
        binaryPath: 'a.aab',
        status: 'inProgress',
        userFraction: 0.1,
      },
      '/proj',
    );
    expect(r.userFraction).toBe(0.1);
  });

  it('rejects unsupported binary extensions', () => {
    expect(() =>
      resolvePlayInputs({ packageName: 'p', binaryPath: 'a.zip' }, '/proj'),
    ).toThrow(/aab.*apk/);
  });

  it('throws when packageName is missing', () => {
    expect(() => resolvePlayInputs({ binaryPath: 'a.aab' }, '/proj')).toThrow(
      /packageName/,
    );
  });

  it('throws when binaryPath is missing', () => {
    expect(() => resolvePlayInputs({ packageName: 'p' }, '/proj')).toThrow(/binaryPath/);
  });
});

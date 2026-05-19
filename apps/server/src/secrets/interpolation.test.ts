import { describe, expect, it } from 'vitest';
import { __testing } from './interpolation';

const { interpolate, collectReferences, SECRET_RE, FILE_RE } = __testing;

describe('interpolation regexes', () => {
  it('matches secrets markers with whitespace variations', () => {
    const matches = [
      ...'a ${{ secrets.FOO }} ${{secrets.BAR}} ${{  secrets.BAZ  }}'.matchAll(SECRET_RE),
    ].map((m) => m[1]);
    expect(matches).toEqual(['FOO', 'BAR', 'BAZ']);
  });

  it('matches files markers', () => {
    const matches = [
      ...'before ${{ files.PROFILE }} after ${{ files.CERT }}'.matchAll(FILE_RE),
    ].map((m) => m[1]);
    expect(matches).toEqual(['PROFILE', 'CERT']);
  });

  it('ignores misspelled markers', () => {
    expect([...'${ secrets.X }'.matchAll(SECRET_RE)]).toHaveLength(0);
    expect([...'${{ secret.X }}'.matchAll(SECRET_RE)]).toHaveLength(0);
    expect([...'${{ secrets.X-Y }}'.matchAll(SECRET_RE)]).toHaveLength(0);
  });
});

describe('interpolate', () => {
  it('substitutes known secret + file names', () => {
    const out = interpolate('echo ${{ secrets.TOKEN }} -- ${{ files.CRED }}', {
      secrets: new Map([['TOKEN', 'sk_live_42']]),
      files: new Map([['CRED', '/tmp/cred.json']]),
    });
    expect(out).toBe('echo sk_live_42 -- /tmp/cred.json');
  });

  it('leaves unknown names untouched so caller can warn', () => {
    const out = interpolate('${{ secrets.MISSING }}', {
      secrets: new Map(),
      files: new Map(),
    });
    expect(out).toBe('${{ secrets.MISSING }}');
  });

  it('substitutes multiple occurrences of the same secret', () => {
    const out = interpolate('${{ secrets.A }} ${{ secrets.A }}', {
      secrets: new Map([['A', 'X']]),
      files: new Map(),
    });
    expect(out).toBe('X X');
  });
});

describe('collectReferences', () => {
  it('walks nested objects + arrays', () => {
    const data = {
      shell: 'curl -H "Bearer ${{ secrets.TOKEN }}"',
      env: { CERT: '${{ files.APPLE_DIST }}' },
      args: ['plain', '${{ secrets.AUX }}'],
      maxRetries: 3,
    };
    const refs = collectReferences(data);
    expect([...refs.secrets].sort()).toEqual(['AUX', 'TOKEN']);
    expect([...refs.files]).toEqual(['APPLE_DIST']);
  });

  it('returns empty sets when nothing references the vault', () => {
    const refs = collectReferences({ shell: 'echo hi', n: 7 });
    expect(refs.secrets.size).toBe(0);
    expect(refs.files.size).toBe(0);
  });
});

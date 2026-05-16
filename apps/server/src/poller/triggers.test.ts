import { describe, expect, it } from 'vitest';
import {
  globToRegExp,
  matchesCron,
  matchesTagPattern,
  parseCron,
  pathsMatchFilter,
} from './triggers';

describe('globToRegExp', () => {
  it('matches v*.*.* against semver tags', () => {
    const rx = globToRegExp('v*.*.*');
    expect(rx.test('v1.2.3')).toBe(true);
    expect(rx.test('v1.2.3-rc1')).toBe(true);
    expect(rx.test('release/1.2.3')).toBe(false);
  });

  it('uses ** to span path segments', () => {
    const rx = globToRegExp('release/**');
    expect(rx.test('release/1.2.3')).toBe(true);
    expect(rx.test('release/cluster-A/1.2.3')).toBe(true);
    expect(rx.test('main')).toBe(false);
  });

  it('? matches a single non-slash char', () => {
    const rx = globToRegExp('v?.?.?');
    expect(rx.test('v1.2.3')).toBe(true);
    expect(rx.test('v12.3.4')).toBe(false);
  });

  it('escapes regex metacharacters in the literal', () => {
    const rx = globToRegExp('foo.bar+');
    expect(rx.test('foo.bar+')).toBe(true);
    expect(rx.test('fooXbar+')).toBe(false);
  });
});

describe('matchesTagPattern', () => {
  it('returns false when the pattern is blank', () => {
    expect(matchesTagPattern('v1.0.0', '')).toBe(false);
    expect(matchesTagPattern('v1.0.0', undefined)).toBe(false);
  });

  it('matches against the full tag name', () => {
    expect(matchesTagPattern('v1.0.0', 'v*.*.*')).toBe(true);
    expect(matchesTagPattern('release/v1.0.0', 'v*.*.*')).toBe(false);
  });
});

describe('pathsMatchFilter', () => {
  it('passes everything when the filter is empty', () => {
    expect(pathsMatchFilter(['src/a.ts'], '')).toBe(true);
    expect(pathsMatchFilter(['src/a.ts'], undefined)).toBe(true);
  });

  it('matches single-glob filters', () => {
    expect(pathsMatchFilter(['src/a.ts', 'README.md'], 'src/**')).toBe(true);
    expect(pathsMatchFilter(['README.md'], 'src/**')).toBe(false);
  });

  it('matches multi-line filters with OR semantics', () => {
    const filter = ['ios/**', 'shared/**'].join('\n');
    expect(pathsMatchFilter(['shared/a.ts'], filter)).toBe(true);
    expect(pathsMatchFilter(['android/a.ts'], filter)).toBe(false);
  });
});

describe('parseCron + matchesCron', () => {
  it('parses 5-field expressions', () => {
    const s = parseCron('*/15 * * * *');
    expect(s).not.toBeNull();
    expect([...s!.minute]).toEqual([0, 15, 30, 45]);
  });

  it('rejects fields with too few / too many parts', () => {
    expect(parseCron('* * * *')).toBeNull();
    expect(parseCron('* * * * * *')).toBeNull();
  });

  it('rejects ranges + names (not supported)', () => {
    expect(parseCron('1-3 * * * *')).toBeNull();
    expect(parseCron('0 0 * mon *')).toBeNull();
  });

  it('matches the parsed expression in UTC', () => {
    const s = parseCron('0 9 * * *')!;
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 9, 0)))).toBe(true);
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 9, 5)))).toBe(false);
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 10, 0)))).toBe(false);
  });

  it('combines dom + dow with OR semantics when both are constrained', () => {
    const s = parseCron('0 0 1 * 5')!; // 1st of any month OR any Friday at midnight
    // 1st of January 2026 is a Thursday: dom matches, dow doesn't → fires.
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 0, 0)))).toBe(true);
    // Some random Friday at midnight: dow matches → fires.
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 16, 0, 0)))).toBe(true);
    // Random non-1st non-Friday day: neither matches.
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 7, 0, 0)))).toBe(false);
  });

  it('accepts comma-separated lists', () => {
    const s = parseCron('0,30 12 * * *')!;
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 12, 0)))).toBe(true);
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 12, 30)))).toBe(true);
    expect(matchesCron(s, new Date(Date.UTC(2026, 0, 1, 12, 15)))).toBe(false);
  });
});

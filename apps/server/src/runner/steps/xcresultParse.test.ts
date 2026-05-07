import { describe, expect, it } from 'vitest';
import { formatTestSummary, parseXcresultSummary } from './xcresultParse';

describe('parseXcresultSummary', () => {
  it('reads Xcode 16+ summary JSON shape', () => {
    const json = JSON.stringify({
      totalTestCount: 42,
      passedTests: 39,
      failedTests: 2,
      skippedTests: 1,
      expectedFailures: 0,
    });
    expect(parseXcresultSummary(json)).toEqual({
      total: 42,
      passed: 39,
      failed: 2,
      skipped: 1,
      expectedFailures: 0,
    });
  });

  it('treats missing fields as zero rather than throwing', () => {
    const json = JSON.stringify({ totalTestCount: 5, passedTests: 5 });
    const s = parseXcresultSummary(json);
    expect(s.total).toBe(5);
    expect(s.passed).toBe(5);
    expect(s.failed).toBe(0);
    expect(s.skipped).toBe(0);
    expect(s.expectedFailures).toBe(0);
  });

  it('rejects non-numeric values for known fields', () => {
    const json = JSON.stringify({ totalTestCount: 'oops', passedTests: 1 });
    const s = parseXcresultSummary(json);
    expect(s.total).toBe(0);
    expect(s.passed).toBe(1);
  });

  it('throws on outright invalid JSON', () => {
    expect(() => parseXcresultSummary('not json')).toThrow();
  });
});

describe('formatTestSummary', () => {
  it('renders a green check when nothing failed', () => {
    expect(
      formatTestSummary({ total: 10, passed: 10, failed: 0, skipped: 0, expectedFailures: 0 }),
    ).toBe('✔ 10/10 tests passed');
  });

  it('renders a red x with failed count when failures exist', () => {
    expect(
      formatTestSummary({ total: 10, passed: 7, failed: 3, skipped: 0, expectedFailures: 0 }),
    ).toBe('✖ 7/10 tests passed (3 failed)');
  });

  it('appends skipped count when skipped > 0', () => {
    expect(
      formatTestSummary({ total: 10, passed: 8, failed: 0, skipped: 2, expectedFailures: 0 }),
    ).toBe('✔ 8/10 tests passed (2 skipped)');
  });

  it('combines failed and skipped into one line', () => {
    expect(
      formatTestSummary({ total: 10, passed: 6, failed: 3, skipped: 1, expectedFailures: 0 }),
    ).toBe('✖ 6/10 tests passed (3 failed) (1 skipped)');
  });
});

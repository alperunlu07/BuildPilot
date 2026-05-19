import { describe, expect, it } from 'vitest';
import { formatAbsolute, formatRelative } from './formatDate';

describe('formatDate helpers', () => {
  it('formatAbsolute renders "—" for null/undefined', () => {
    expect(formatAbsolute(null)).toBe('—');
    expect(formatAbsolute(undefined)).toBe('—');
  });

  it('formatAbsolute accepts numeric epoch ms and a Date instance', () => {
    const ts = Date.UTC(2024, 0, 15, 12, 30, 0);
    const fromNum = formatAbsolute(ts);
    const fromDate = formatAbsolute(new Date(ts));
    expect(fromNum).toBe(fromDate);
    expect(fromNum.length).toBeGreaterThan(0);
  });

  it('formatRelative returns "—" for null/undefined', () => {
    expect(formatRelative(null)).toBe('—');
    expect(formatRelative(undefined)).toBe('—');
  });

  it('formatRelative returns a human distance string for a recent timestamp', () => {
    const ts = Date.now() - 30 * 1000; // 30s ago
    const rel = formatRelative(ts);
    // date-fns produces phrases like "less than a minute ago"
    expect(rel.toLowerCase()).toContain('ago');
  });

  it('formatRelative falls back without throwing for far-future dates', () => {
    const far = new Date(8640000000000000); // max valid date
    const rel = formatRelative(far);
    expect(typeof rel).toBe('string');
    expect(rel.length).toBeGreaterThan(0);
  });
});

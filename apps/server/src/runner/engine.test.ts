import { describe, expect, it } from 'vitest';
import { readRetryPolicy, readWatchdog } from './engine';

describe('readRetryPolicy', () => {
  it('returns null when retryPolicy is missing', () => {
    expect(readRetryPolicy({})).toBeNull();
    expect(readRetryPolicy({ retryPolicy: null })).toBeNull();
  });

  it('returns null when enabled=false', () => {
    expect(readRetryPolicy({ retryPolicy: { enabled: false } })).toBeNull();
  });

  it('accepts enabled="true" as a string (UI emits strings on checkboxes)', () => {
    const p = readRetryPolicy({ retryPolicy: { enabled: 'true' } });
    expect(p?.enabled).toBe(true);
  });

  it('clamps maxRetries to [0, 10]', () => {
    expect(readRetryPolicy({ retryPolicy: { enabled: true, maxRetries: -5 } })?.maxRetries).toBe(
      0,
    );
    expect(readRetryPolicy({ retryPolicy: { enabled: true, maxRetries: 999 } })?.maxRetries).toBe(
      10,
    );
  });

  it('defaults maxRetries=3 / backoffMs=1000 / backoffMaxMs=30000', () => {
    const p = readRetryPolicy({ retryPolicy: { enabled: true } });
    expect(p).toEqual({ enabled: true, maxRetries: 3, backoffMs: 1000, backoffMaxMs: 30000 });
  });

  it('enforces backoffMaxMs >= backoffMs', () => {
    const p = readRetryPolicy({
      retryPolicy: { enabled: true, backoffMs: 5000, backoffMaxMs: 1000 },
    });
    // backoffMaxMs gets pulled up to backoffMs.
    expect(p?.backoffMaxMs).toBe(5000);
  });

  it('clamps negative backoffMs to 0', () => {
    expect(
      readRetryPolicy({ retryPolicy: { enabled: true, backoffMs: -1 } })?.backoffMs,
    ).toBe(0);
  });
});

describe('readWatchdog', () => {
  it('returns null when missing or disabled', () => {
    expect(readWatchdog({})).toBeNull();
    expect(readWatchdog({ watchdog: { enabled: false } })).toBeNull();
  });

  it('defaults idleSec=600 when not provided', () => {
    expect(readWatchdog({ watchdog: { enabled: true } })).toEqual({
      enabled: true,
      idleSec: 600,
    });
  });

  it('passes through positive idleSec', () => {
    expect(readWatchdog({ watchdog: { enabled: true, idleSec: 120 } })).toEqual({
      enabled: true,
      idleSec: 120,
    });
  });

  it('falls back to 600 when idleSec is zero or negative', () => {
    expect(
      readWatchdog({ watchdog: { enabled: true, idleSec: 0 } })?.idleSec,
    ).toBe(600);
    expect(
      readWatchdog({ watchdog: { enabled: true, idleSec: -10 } })?.idleSec,
    ).toBe(600);
  });
});

import { describe, expect, it } from 'vitest';
import { diffReports, parseAppThinningReport } from './appThinningReportParse';

const FIXTURE = `App Thinning Size Report for All Variants of MyApp
Variant: MyApp-iPhone-arm64
    App size: 42.5 MB
    Download size: 18.2 MB

Variant: MyApp-iPad-arm64
    App size: 44.1 MB
    Download size: 19.3 MB
`;

describe('parseAppThinningReport', () => {
  it('splits by Variant: header and parses MB sizes', () => {
    const v = parseAppThinningReport(FIXTURE);
    expect(v).toHaveLength(2);
    expect(v[0]?.name).toBe('MyApp-iPhone-arm64');
    expect(v[0]?.appSizeBytes).toBeCloseTo(42.5 * 1024 * 1024, -3);
    expect(v[1]?.downloadSizeBytes).toBeCloseTo(19.3 * 1024 * 1024, -3);
  });

  it('handles empty input', () => {
    expect(parseAppThinningReport('')).toEqual([]);
  });
});

describe('diffReports', () => {
  it('computes per-variant deltas + percent change', () => {
    const current = parseAppThinningReport(FIXTURE);
    const baseline = parseAppThinningReport(
      FIXTURE.replace('42.5 MB', '40 MB').replace('18.2 MB', '17 MB'),
    );
    const deltas = diffReports(current, baseline);
    expect(deltas).toHaveLength(2);
    expect(deltas[0]?.appDeltaBytes).toBeGreaterThan(0);
    expect(deltas[0]?.appPctChange).toBeGreaterThan(0);
  });

  it('skips variants only in current report', () => {
    const current = parseAppThinningReport(FIXTURE);
    const baseline = parseAppThinningReport(FIXTURE.split('Variant: MyApp-iPad-arm64')[0]!);
    const deltas = diffReports(current, baseline);
    expect(deltas).toHaveLength(1);
  });
});

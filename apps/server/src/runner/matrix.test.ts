import { describe, expect, it } from 'vitest';
import {
  expandMatrix,
  interpolateMatrixData,
  interpolateMatrixString,
  matrixLabel,
} from './matrix';

// Cluster 11.C — pure helpers in matrix.ts. The integration with the
// runner is exercised by the broader engine tests; here we just nail
// down the expansion math and the placeholder substitution rules.

describe('expandMatrix', () => {
  it('returns the cross product in odometer order', () => {
    const out = expandMatrix({
      axes: { xcode: ['15', '16'], scheme: ['Free', 'Pro'] },
    });
    expect(out).toEqual([
      { xcode: '15', scheme: 'Free' },
      { xcode: '15', scheme: 'Pro' },
      { xcode: '16', scheme: 'Free' },
      { xcode: '16', scheme: 'Pro' },
    ]);
  });

  it('handles a single axis with several values', () => {
    expect(expandMatrix({ axes: { node: ['18', '20', '22'] } })).toEqual([
      { node: '18' },
      { node: '20' },
      { node: '22' },
    ]);
  });

  it('returns [] when an axis has no values', () => {
    expect(expandMatrix({ axes: { foo: [] } })).toEqual([]);
  });

  it('returns [] when there are no axes', () => {
    expect(expandMatrix({ axes: {} })).toEqual([]);
  });

  it('preserves insertion order across multiple axes', () => {
    const out = expandMatrix({
      axes: { a: ['1', '2'], b: ['x'], c: ['p', 'q'] },
    });
    // 2 * 1 * 2 = 4 combinations.
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ a: '1', b: 'x', c: 'p' });
    expect(out[3]).toEqual({ a: '2', b: 'x', c: 'q' });
  });
});

describe('matrixLabel', () => {
  it('sorts axes alphabetically for deterministic labels', () => {
    expect(matrixLabel({ scheme: 'Free', xcode: '15' })).toBe(
      'scheme=Free, xcode=15',
    );
    // Re-ordering the input should not change the label.
    expect(matrixLabel({ xcode: '15', scheme: 'Free' })).toBe(
      'scheme=Free, xcode=15',
    );
  });

  it('handles the single-axis case', () => {
    expect(matrixLabel({ node: '20' })).toBe('node=20');
  });

  it('returns empty string when there are no values', () => {
    expect(matrixLabel({})).toBe('');
  });
});

describe('interpolateMatrixString', () => {
  it('substitutes ${{ matrix.X }} placeholders', () => {
    expect(
      interpolateMatrixString('xcode-${{ matrix.xcode }}', { xcode: '15' }),
    ).toBe('xcode-15');
  });

  it('is tolerant of surrounding whitespace', () => {
    expect(
      interpolateMatrixString('xcode-${{   matrix.xcode   }}', { xcode: '15' }),
    ).toBe('xcode-15');
  });

  it('leaves unknown placeholders untouched', () => {
    const tmpl = 'unknown=${{ matrix.nope }}';
    expect(interpolateMatrixString(tmpl, { xcode: '15' })).toBe(tmpl);
  });

  it('handles multiple substitutions in one string', () => {
    expect(
      interpolateMatrixString(
        'xcodebuild -scheme ${{ matrix.scheme }} -destination "OS=${{ matrix.xcode }}"',
        { xcode: '15', scheme: 'Pro' },
      ),
    ).toBe('xcodebuild -scheme Pro -destination "OS=15"');
  });
});

describe('interpolateMatrixData', () => {
  it('recurses into nested objects and arrays', () => {
    const data = {
      command: 'echo ${{ matrix.scheme }}',
      env: { SCHEME: '${{ matrix.scheme }}', UNCHANGED: 'literal' },
      args: ['-x', '${{ matrix.xcode }}'],
      flag: true,
      retries: 3,
    };
    const out = interpolateMatrixData(data, { xcode: '16', scheme: 'Pro' });
    expect(out).toEqual({
      command: 'echo Pro',
      env: { SCHEME: 'Pro', UNCHANGED: 'literal' },
      args: ['-x', '16'],
      flag: true,
      retries: 3,
    });
  });

  it('does not mutate the input', () => {
    const data = { x: '${{ matrix.foo }}' };
    interpolateMatrixData(data, { foo: 'bar' });
    expect(data.x).toBe('${{ matrix.foo }}');
  });
});

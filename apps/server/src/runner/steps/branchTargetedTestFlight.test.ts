import { describe, expect, it } from 'vitest';
import { parseBranchMapping, pickGroupForBranch } from './branchTargetedTestFlight';

describe('parseBranchMapping', () => {
  it('parses literal mappings', () => {
    const m = parseBranchMapping('main => Internal\nrelease/* => Beta');
    expect(m).toHaveLength(2);
    expect(m[0]?.pattern.test('main')).toBe(true);
    expect(m[1]?.pattern.test('release/1.4.0')).toBe(true);
    expect(m[1]?.pattern.test('main')).toBe(false);
  });

  it('parses /regex/ form', () => {
    const m = parseBranchMapping('/^feature\\/.*/ => Internal');
    expect(m[0]?.pattern.test('feature/x')).toBe(true);
    expect(m[0]?.pattern.test('main')).toBe(false);
  });

  it('skips blank + comment lines', () => {
    const m = parseBranchMapping('# header\n\nmain => Internal');
    expect(m).toHaveLength(1);
  });

  it('rejects malformed lines', () => {
    expect(() => parseBranchMapping('mainInternal')).toThrow(/=>/);
    expect(() => parseBranchMapping('main =>')).toThrow();
    expect(() => parseBranchMapping('=> X')).toThrow();
  });
});

describe('pickGroupForBranch', () => {
  it('returns the first matching group', () => {
    const m = parseBranchMapping('main => Internal\nrelease/* => Beta');
    expect(pickGroupForBranch('main', m)).toBe('Internal');
    expect(pickGroupForBranch('release/1.0.0', m)).toBe('Beta');
  });

  it('falls back when no match', () => {
    const m = parseBranchMapping('main => Internal');
    expect(pickGroupForBranch('feature/x', m, 'Catchall')).toBe('Catchall');
    expect(pickGroupForBranch('feature/x', m)).toBeUndefined();
  });
});

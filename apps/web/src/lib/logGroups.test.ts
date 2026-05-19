import { describe, expect, it } from 'vitest';
import type { BuildLogEntry } from '@buildpilot/shared-types';
import { buildGroupFilter, detectLogGroups } from './logGroups';

function mk(
  seq: number,
  message: string,
  level: BuildLogEntry['level'] = 'stdout',
): BuildLogEntry {
  return { seq, ts: seq * 1000, level, nodeId: 'n', stepType: null, message };
}

describe('detectLogGroups', () => {
  it('returns no groups when there are no markers', () => {
    const entries = [mk(1, 'a'), mk(2, 'b')];
    expect(detectLogGroups(entries)).toEqual([]);
  });

  it('detects a ::group::/::endgroup:: pair', () => {
    const entries = [
      mk(1, '::group::Build::'),
      mk(2, 'compiling'),
      mk(3, 'error: missing semicolon', 'failure'),
      mk(4, '::endgroup::'),
      mk(5, 'after the group'),
    ];
    const groups = detectLogGroups(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: 'Build',
      startSeq: 1,
      endSeq: 4,
      contentStartSeq: 2,
      contentEndSeq: 3,
      count: 2,
      failureCount: 1,
      stderrCount: 0,
    });
  });

  it('detects fastlane-style --- markers and auto-closes the previous one', () => {
    const entries = [
      mk(1, '--- Run xcodebuild ---'),
      mk(2, 'line1'),
      mk(3, '--- Sign artifact ---'),
      mk(4, 'line2'),
    ];
    const groups = detectLogGroups(entries);
    expect(groups.map((g) => g.name)).toEqual(['Run xcodebuild', 'Sign artifact']);
  });

  it('buildGroupFilter hides content of collapsed groups but keeps the marker', () => {
    const entries = [
      mk(1, '::group::Build::'),
      mk(2, 'compiling'),
      mk(3, '::endgroup::'),
    ];
    const groups = detectLogGroups(entries);
    const filter = buildGroupFilter(groups, new Set([groups[0]!.id]));
    expect(filter(entries[0]!)).toBe(true); // marker kept
    expect(filter(entries[1]!)).toBe(false); // content hidden
    expect(filter(entries[2]!)).toBe(true); // endgroup falls outside content
  });

  it('buildGroupFilter is a no-op when no groups are collapsed', () => {
    const entries = [mk(1, '::group::X::'), mk(2, 'a'), mk(3, '::endgroup::')];
    const filter = buildGroupFilter(detectLogGroups(entries), new Set());
    for (const e of entries) expect(filter(e)).toBe(true);
  });
});

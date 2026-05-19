import { describe, expect, it } from 'vitest';
import type { BuildLogEntry, StepType } from '@buildpilot/shared-types';
import { commandFromEntry } from './copyCommand';

function entry(partial: Partial<BuildLogEntry> & { message: string }): BuildLogEntry {
  const base: BuildLogEntry = {
    seq: 1,
    ts: 0,
    level: 'info',
    nodeId: 'n1',
    stepType: 'shell' as StepType,
    message: partial.message,
  };
  return { ...base, ...partial };
}

describe('commandFromEntry', () => {
  it('returns null when nodeId is missing', () => {
    expect(commandFromEntry(entry({ message: 'whatever', nodeId: null }))).toBeNull();
  });

  it('strips the leading "$ " from shell-style command lines at any level', () => {
    expect(
      commandFromEntry(entry({ message: '$ echo hello', level: 'stdout' })),
    ).toBe('echo hello');
  });

  it('skips informational "cwd: ..." lines', () => {
    expect(commandFromEntry(entry({ message: 'cwd: /tmp' }))).toBeNull();
  });

  it('extracts "remote: …" prefix lines from ssh steps', () => {
    expect(
      commandFromEntry(
        entry({ message: 'remote: ls /var/log', stepType: 'remoteSsh', level: 'stdout' }),
      ),
    ).toBe('ls /var/log');
  });

  it('returns null for non-info / non-shell lines on regular steps', () => {
    expect(
      commandFromEntry(entry({ message: 'stuff happened', level: 'stdout' })),
    ).toBeNull();
  });

  it('returns the literal line for command-bearing steps at info level', () => {
    expect(
      commandFromEntry(
        entry({
          message: 'xcodebuild -workspace App.xcworkspace -scheme App build',
          stepType: 'xcodebuild',
          level: 'info',
        }),
      ),
    ).toBe('xcodebuild -workspace App.xcworkspace -scheme App build');
  });

  it('rejects status prose like "opened: ..." from command-bearing steps', () => {
    expect(
      commandFromEntry(
        entry({
          message: 'opened: capture stream',
          stepType: 'xcodebuild',
          level: 'info',
        }),
      ),
    ).toBeNull();
  });

  it('returns null when the step is not command-bearing', () => {
    expect(
      commandFromEntry(
        entry({ message: 'some line', stepType: 'httpRequest', level: 'info' }),
      ),
    ).toBeNull();
  });
});

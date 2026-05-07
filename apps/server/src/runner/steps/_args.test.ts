import { describe, expect, it } from 'vitest';
import {
  pushWorkspaceOrProject,
  splitAdditionalArgs,
  splitMultilinePaths,
} from './_args';

describe('splitAdditionalArgs', () => {
  it('returns [] for undefined / empty / whitespace input', () => {
    expect(splitAdditionalArgs(undefined)).toEqual([]);
    expect(splitAdditionalArgs('')).toEqual([]);
    expect(splitAdditionalArgs('   ')).toEqual([]);
  });

  it('splits on whitespace and shell-quotes each token', () => {
    expect(splitAdditionalArgs('--verbose --output json')).toEqual([
      `'--verbose'`,
      `'--output'`,
      `'json'`,
    ]);
  });

  it('collapses runs of whitespace', () => {
    expect(splitAdditionalArgs('a   b\tc')).toEqual([`'a'`, `'b'`, `'c'`]);
  });
});

describe('splitMultilinePaths', () => {
  it('returns [] for undefined / empty input', () => {
    expect(splitMultilinePaths(undefined)).toEqual([]);
    expect(splitMultilinePaths('')).toEqual([]);
    expect(splitMultilinePaths('\n\n  \n')).toEqual([]);
  });

  it('splits on newlines, trims, drops blanks, shell-quotes each', () => {
    expect(splitMultilinePaths('Sources\nTests\n   \nApp/Foo')).toEqual([
      `'Sources'`,
      `'Tests'`,
      `'App/Foo'`,
    ]);
  });

  it('tolerates CRLF line endings', () => {
    expect(splitMultilinePaths('Sources\r\nTests')).toEqual([`'Sources'`, `'Tests'`]);
  });
});

describe('pushWorkspaceOrProject', () => {
  it('appends --workspace when workspacePath is set', () => {
    const parts: string[] = [];
    pushWorkspaceOrProject(
      parts,
      { workspacePath: 'MyApp.xcworkspace' },
      { workspaceFlag: '--workspace', projectFlag: '--project' },
    );
    expect(parts).toEqual(['--workspace', `'MyApp.xcworkspace'`]);
  });

  it('falls back to projectPath when workspacePath is missing / empty', () => {
    const parts: string[] = [];
    pushWorkspaceOrProject(
      parts,
      { workspacePath: '   ', projectPath: 'MyApp.xcodeproj' },
      { workspaceFlag: '-workspace', projectFlag: '-project' },
    );
    expect(parts).toEqual(['-project', `'MyApp.xcodeproj'`]);
  });

  it('does nothing when both are absent and requireOne is not set', () => {
    const parts: string[] = ['existing'];
    pushWorkspaceOrProject(
      parts,
      {},
      { workspaceFlag: '--workspace', projectFlag: '--project' },
    );
    expect(parts).toEqual(['existing']);
  });

  it('throws when both are absent and requireOne is true', () => {
    expect(() =>
      pushWorkspaceOrProject(
        [],
        {},
        {
          workspaceFlag: '--workspace',
          projectFlag: '--project',
          requireOne: true,
          stepName: 'demo',
        },
      ),
    ).toThrow(/demo: requires either "workspacePath" or "projectPath"/);
  });
});

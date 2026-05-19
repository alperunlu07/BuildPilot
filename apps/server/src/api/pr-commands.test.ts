import { describe, expect, it } from 'vitest';
import { __test__ } from './pr-commands';

const { parseSlashCommand, pickPipelineForCommand, slug } = __test__;

describe('parseSlashCommand', () => {
  it('matches first slash token on a single-line comment', () => {
    expect(parseSlashCommand('/run-ios please')).toEqual({
      command: 'run-ios',
      args: 'please',
    });
  });

  it('returns null when the comment has no slash command', () => {
    expect(parseSlashCommand('LGTM 👍')).toBeNull();
  });

  it('scans through prose lines to find the first slash token', () => {
    expect(parseSlashCommand('Looks good!\n/run-all\nthanks')).toEqual({
      command: 'run-all',
      args: '',
    });
  });

  it('lower-cases the command token', () => {
    expect(parseSlashCommand('/RUN-iOS')?.command).toBe('run-ios');
  });
});

describe('pickPipelineForCommand', () => {
  const mkPipeline = (id: string, name: string, cmds: string, authors = '') => ({
    id,
    name,
    watch: { prCommands: cmds, prCommandAuthors: authors },
  });

  it('matches an explicit token', () => {
    const result = pickPipelineForCommand(
      [mkPipeline('p1', 'iOS build', 'run-ios, run-ios-tests')],
      'run-ios',
      null,
    );
    if ('error' in result) throw new Error(result.error);
    expect(result.pipelineId).toBe('p1');
  });

  it('matches via wildcard + slug-of-name', () => {
    const result = pickPipelineForCommand(
      [mkPipeline('p1', 'iOS · build & test', '*')],
      'ios-build-test',
      null,
    );
    if ('error' in result) throw new Error(result.error);
    expect(result.pipelineId).toBe('p1');
  });

  it('returns error when no pipeline matches', () => {
    const result = pickPipelineForCommand(
      [mkPipeline('p1', 'iOS build', 'run-ios')],
      'deploy',
      null,
    );
    expect('error' in result).toBe(true);
  });

  it('enforces the author whitelist', () => {
    const result = pickPipelineForCommand(
      [mkPipeline('p1', 'iOS build', 'run-ios', 'alperunlu07')],
      'run-ios',
      'mallory',
    );
    expect('error' in result).toBe(true);
  });

  it('returns ambiguous when multiple pipelines match', () => {
    const result = pickPipelineForCommand(
      [
        mkPipeline('p1', 'iOS build', 'run'),
        mkPipeline('p2', 'Android build', 'run'),
      ],
      'run',
      null,
    );
    expect('error' in result).toBe(true);
  });

  it('skips pipelines with no commands configured', () => {
    const result = pickPipelineForCommand(
      [
        mkPipeline('p1', 'iOS build', ''),
        mkPipeline('p2', 'Android build', 'run-android'),
      ],
      'run-android',
      null,
    );
    if ('error' in result) throw new Error(result.error);
    expect(result.pipelineId).toBe('p2');
  });
});

describe('slug', () => {
  it('lowercases and collapses non-alpha-num runs', () => {
    expect(slug('iOS · Build & Test')).toBe('ios-build-test');
  });
});

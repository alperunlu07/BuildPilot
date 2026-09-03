import { describe, expect, it } from 'vitest';
import {
  buildUgsCommand,
  catalogBundleNames,
  ccdContentUrl,
  parseUgsJson,
  ugsPathArg,
  ugsQuote,
  ugsTargetArgs,
} from './_ccd';

describe('ugsQuote', () => {
  // npm's launcher concatenates argv into a shell string, so a spaced value
  // has to arrive carrying its own quotes or the CLI sees two arguments and
  // rejects the second. Verified against ugs 1.8.0 on Windows.
  it('wraps spaced values so they survive the launcher round-trip', () => {
    expect(ugsQuote('release notes here', 'shim')).toBe('"\\"release notes here\\""');
  });

  it('leaves simple tokens alone', () => {
    expect(ugsQuote('Android', 'shim')).toBe('Android');
    expect(ugsQuote('catalog_0.0.53.json', 'shim')).toBe('catalog_0.0.53.json');
  });

  it('quotes an empty value so it stays a positional argument', () => {
    expect(ugsQuote('', 'shim')).toBe('"\\"\\""');
  });

  it('uses plain quoting for a native binary', () => {
    expect(ugsQuote('release notes here', 'native')).toBe('"release notes here"');
    expect(ugsQuote('Android', 'native')).toBe('Android');
  });

  it('defaults to shim quoting when the mode is unset', () => {
    expect(ugsQuote('a b', undefined)).toBe('"\\"a b\\""');
  });

  // The command string is handed to spawn(..., { shell: true }), and bundle
  // names come off the filesystem / out of the catalog rather than from a
  // human, so a metacharacter must never reach the shell unquoted.
  it('quotes shell metacharacters even without whitespace', () => {
    expect(ugsQuote('a&calc.bundle', 'shim')).toBe('"\\"a&calc.bundle\\""');
    expect(ugsQuote('x;y', 'shim')).toBe('"\\"x;y\\""');
    expect(ugsQuote('a|b', 'native')).toBe('"a|b"');
    expect(ugsQuote('(x)', 'shim')).toBe('"\\"(x)\\""');
  });

  it('refuses values that keep expanding inside quotes', () => {
    for (const bad of ['a`whoami`', 'a$(id)', '%USERPROFILE%', 'a\nb']) {
      expect(() => ugsQuote(bad, 'shim')).toThrow(/refusing to build a ugs command/);
      expect(() => ugsQuote(bad, 'native')).toThrow(/refusing to build a ugs command/);
    }
  });
});

describe('buildUgsCommand', () => {
  it('quotes a launcher path containing spaces', () => {
    const cmd = buildUgsCommand(
      { ugsPath: 'C:/Program Files/ugs/ugs.exe', argQuoting: 'native' },
      ['ccd', 'buckets', 'list'],
    );
    expect(cmd).toBe('"C:/Program Files/ugs/ugs.exe" ccd buckets list');
  });

  it('falls back to ugs on PATH', () => {
    expect(buildUgsCommand({}, ['ccd', 'buckets', 'list'])).toBe('ugs ccd buckets list');
  });

  it('quotes a launcher carrying a metacharacter instead of passing it through', () => {
    expect(buildUgsCommand({ ugsPath: 'ugs&calc' }, ['ccd'])).toBe('"ugs&calc" ccd');
  });

  it('refuses a launcher that would expand inside quotes', () => {
    expect(() => buildUgsCommand({ ugsPath: 'ugs`id`' }, ['ccd'])).toThrow(/"ugsPath"/);
  });
});

describe('ugsPathArg', () => {
  // ugs resolves local paths against the process cwd — the project root, not
  // the content directory — so an entry upload has to name an absolute path.
  // Forward slashes keep a spaced path clear of backslash-vs-quote trouble
  // once ugsQuote wraps it.
  it('normalises Windows separators', () => {
    expect(ugsPathArg('C:\\proj\\CCDBuildData\\catalog_0.0.53.json')).toBe(
      'C:/proj/CCDBuildData/catalog_0.0.53.json',
    );
  });

  it('leaves a POSIX path untouched', () => {
    expect(ugsPathArg('/proj/CCDBuildData/catalog.json')).toBe('/proj/CCDBuildData/catalog.json');
  });

  it('stays quotable when the path contains spaces', () => {
    expect(ugsQuote(ugsPathArg('C:\\Unity Projects\\Game\\c.json'), 'shim')).toBe(
      '"\\"C:/Unity Projects/Game/c.json\\""',
    );
  });
});

describe('ugsTargetArgs', () => {
  it('defaults the environment and omits an unset project', () => {
    expect(ugsTargetArgs({})).toEqual(['-e', 'production']);
  });

  it('passes both through when set', () => {
    expect(ugsTargetArgs({ environmentName: 'staging', ugsProjectId: 'abc' })).toEqual([
      '-e',
      'staging',
      '-p',
      'abc',
    ]);
  });
});

describe('parseUgsJson', () => {
  // `ugs --json` prints the payload and then a second array of progress
  // messages; JSON.parse rejects the concatenation outright.
  it('returns the payload when a trailing info array follows', () => {
    const out = '[{"Id":"b1","Name":"Android"}]\n[{"Message":"Listing items 1-1/1"}]';
    expect(parseUgsJson(out)).toEqual([{ Id: 'b1', Name: 'Android' }]);
  });

  it('skips a leading non-JSON warning line', () => {
    const out = '(node:1) DeprecationWarning: whatever\n{"ReleaseNum":46}';
    expect(parseUgsJson(out)).toEqual({ ReleaseNum: 46 });
  });

  it('is not fooled by braces inside strings', () => {
    expect(parseUgsJson('[{"Name":"a[b]c"}]')).toEqual([{ Name: 'a[b]c' }]);
  });

  it('throws when there is no JSON at all', () => {
    expect(() => parseUgsJson('command not found')).toThrow(/no JSON/);
  });
});

describe('catalogBundleNames', () => {
  it('collects bundle basenames and drops everything else', () => {
    const catalog = {
      m_InternalIds: [
        'Assets/Art/Thing.png',
        '{prefix}/remote_game_core_assets_all_abc.bundle',
        'C:\\build\\local_bootstrap_assets_all_def.bundle',
        'remote_game_core_assets_all_abc.bundle',
      ],
    };
    expect(catalogBundleNames(catalog)).toEqual([
      'local_bootstrap_assets_all_def.bundle',
      'remote_game_core_assets_all_abc.bundle',
    ]);
  });

  it('rejects a file that is not a catalog', () => {
    expect(() => catalogBundleNames({ hello: 'world' })).toThrow(/m_InternalIds/);
  });
});

describe('ccdContentUrl', () => {
  it('builds the badge-resolved client URL players use', () => {
    const url = ccdContentUrl({
      projectId: 'p1',
      environmentName: 'production',
      bucketId: 'b1',
      badge: 'latest',
      path: 'catalog_0.0.53.hash',
    });
    expect(url).toBe(
      'https://p1.client-api.unity3dusercontent.com/client_api/v1/environments/production' +
        '/buckets/b1/release_by_badge/latest/entry_by_path/content/?path=/catalog_0.0.53.hash',
    );
  });
});

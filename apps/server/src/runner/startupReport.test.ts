import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findRepoRoot,
  formatStartupReport,
  formatTimestamp,
  selectProjectRepos,
  shouldSend,
  truncate,
  type RepoSummary,
  type StartupReportData,
} from './startupReport';

function repo(overrides: Partial<RepoSummary> = {}): RepoSummary {
  return {
    label: 'BuildPilot',
    branch: 'main',
    tracking: 'origin/main',
    ahead: 0,
    behind: 0,
    dirtyFiles: 0,
    commits: [
      {
        shortSha: 'fe9d09c',
        subject: 'fix(desktop): build the main process before `start`',
        author: 'Alper Ünlü',
        date: new Date(2026, 6, 21, 9, 0, 0).getTime(),
      },
    ],
    ...overrides,
  };
}

function baseData(overrides: Partial<StartupReportData> = {}): StartupReportData {
  return {
    host: 'BUILDBOX',
    user: 'PF',
    os: 'win32 10.0.26200',
    // Built from local components so the expected string is timezone-independent.
    at: new Date(2026, 8, 3, 10, 45, 12),
    serverUrl: 'http://127.0.0.1:35700',
    version: '0.1.0',
    repos: [repo()],
    omittedRepos: 0,
    ...overrides,
  };
}

describe('formatTimestamp', () => {
  it('renders local wall-clock time with a UTC offset tag', () => {
    const s = formatTimestamp(new Date(2026, 8, 3, 10, 45, 12));
    expect(s).toMatch(/^03\.09\.2026 10:45:12 \(UTC[+-]\d{2}:\d{2}\)$/);
  });

  it('zero-pads single-digit day, month, hour, minute and second', () => {
    const s = formatTimestamp(new Date(2026, 0, 5, 7, 8, 9));
    expect(s.startsWith('05.01.2026 07:08:09 ')).toBe(true);
  });
});

describe('truncate', () => {
  it('collapses whitespace and leaves short strings intact', () => {
    expect(truncate('  fix:   a  thing\n', 40)).toBe('fix: a thing');
  });

  it('cuts to the limit with an ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate('abcdefghij', 5)).toHaveLength(5);
  });
});

describe('formatStartupReport', () => {
  it('reports machine, clock, server and repo state', () => {
    const text = formatStartupReport(baseData());
    expect(text).toContain('BuildPilot started');
    expect(text).toContain('PC:     BUILDBOX (PF)');
    expect(text).toContain('OS:     win32 10.0.26200');
    expect(text).toContain('03.09.2026 10:45:12');
    expect(text).toContain('http://127.0.0.1:35700 · v0.1.0');
    expect(text).toContain('BuildPilot @ main · in sync · clean');
    expect(text).toContain('• fe9d09c fix(desktop): build the main process before `start`');
    expect(text).toContain('— Alper Ünlü · 21.07');
  });

  it('gives every repo its own section, BuildPilot first', () => {
    const text = formatStartupReport(
      baseData({
        repos: [
          repo(),
          repo({
            label: 'Zooyale',
            branch: 'development',
            behind: 2,
            dirtyFiles: 3,
            commits: [
              { shortSha: 'aaa1111', subject: 'feat: daily reward', author: 'Dev', date: 0 },
            ],
          }),
          repo({ label: 'NetworkTest', branch: 'development', commits: [] }),
        ],
      }),
    );
    expect(text).toContain('BuildPilot @ main · in sync · clean');
    expect(text).toContain('Zooyale @ development · ↓2 · 3 uncommitted files');
    expect(text).toContain('• aaa1111 feat: daily reward — Dev');
    expect(text).toContain('NetworkTest @ development · in sync · clean');
    // A repo with no commits says so rather than silently ending the section.
    expect(text).toContain('(no commits)');
    // Order: self, then projects as supplied.
    expect(text.indexOf('BuildPilot @')).toBeLessThan(text.indexOf('Zooyale @'));
    expect(text.indexOf('Zooyale @')).toBeLessThan(text.indexOf('NetworkTest @'));
  });

  it('omits the commit date when the timestamp is unknown', () => {
    const text = formatStartupReport(
      baseData({
        repos: [repo({ commits: [{ shortSha: 'bbb2222', subject: 'wip', author: 'Dev', date: 0 }] })],
      }),
    );
    const line = text.split('\n').find((l) => l.includes('bbb2222'));
    expect(line).toBe('  • bbb2222 wip — Dev');
  });

  it('singularises a lone uncommitted file', () => {
    const text = formatStartupReport(baseData({ repos: [repo({ dirtyFiles: 1 })] }));
    expect(text).toContain('· 1 uncommitted file\n');
  });

  it('says so when the branch has no upstream', () => {
    const text = formatStartupReport(baseData({ repos: [repo({ tracking: null })] }));
    expect(text).toContain('· no upstream ·');
  });

  it('degrades to a repo-less report when nothing was found', () => {
    const text = formatStartupReport(baseData({ repos: [] }));
    expect(text).toContain('Repos:  none found');
    expect(text).not.toContain('•');
  });

  it('reports repos dropped before collection in the trailer', () => {
    const text = formatStartupReport(baseData({ omittedRepos: 4 }));
    expect(text).toContain('… and 4 more repos not shown');
  });

  it('drops whole sections rather than exceeding the Telegram limit', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      repo({
        label: `Project ${i}`,
        commits: Array.from({ length: 3 }, (_, j) => ({
          shortSha: `abc12${i}${j}`,
          subject: 'x'.repeat(200),
          author: 'Somebody With A Long Name',
          date: Date.now(),
        })),
      }),
    );
    const text = formatStartupReport(baseData({ repos: many }));
    expect(text.length).toBeLessThan(4096);
    expect(text).toMatch(/… and \d+ more repos not shown$/);
    // Whatever survived is intact: every listed repo kept all three commits.
    const sections = text.split('\n\n').filter((s) => s.startsWith('Project '));
    for (const s of sections) {
      expect(s.split('\n').filter((l) => l.trimStart().startsWith('•'))).toHaveLength(3);
    }
  });
});

describe('selectProjectRepos', () => {
  const allExist = (): boolean => true;

  it('keeps every registered project that is a git checkout', () => {
    const { repos, omitted } = selectProjectRepos(
      [
        { name: 'Zooyale', path: 'C:/Users/PF/Unity/Zooyale_6_1' },
        { name: 'NetworkTest', path: 'C:/Users/PF/Unity/NetworkTest' },
      ],
      null,
      allExist,
    );
    expect(repos).toEqual([
      { label: 'Zooyale', path: 'C:/Users/PF/Unity/Zooyale_6_1' },
      { label: 'NetworkTest', path: 'C:/Users/PF/Unity/NetworkTest' },
    ]);
    expect(omitted).toBe(0);
  });

  it('skips a project pointing at the BuildPilot checkout itself', () => {
    const { repos } = selectProjectRepos(
      [
        { name: 'BuildPilot (self)', path: 'C:/Users/PF/GitHub/BuildPilot' },
        { name: 'Zooyale', path: 'C:/Users/PF/Unity/Zooyale_6_1' },
      ],
      'C:\\Users\\PF\\GitHub\\BuildPilot',
      allExist,
    );
    expect(repos.map((r) => r.label)).toEqual(['Zooyale']);
  });

  it('de-duplicates two projects sharing one working copy', () => {
    const { repos } = selectProjectRepos(
      [
        { name: 'Zooyale APK', path: 'C:/Unity/Zooyale' },
        { name: 'Zooyale AAB', path: 'c:/unity/zooyale' },
      ],
      null,
      allExist,
    );
    expect(repos.map((r) => r.label)).toEqual(['Zooyale APK']);
  });

  it('drops projects whose directory is gone or is not a checkout', () => {
    const { repos } = selectProjectRepos(
      [
        { name: 'Live', path: 'C:/repos/live' },
        { name: 'Detached clone', path: 'D:/external-drive/gone' },
        { name: 'Plain folder', path: 'C:/repos/notes' },
      ],
      null,
      // The predicate is handed "<path>/.git", joined with the platform separator.
      (p) => p.replace(/\\/g, '/').startsWith('C:/repos/live/'),
    );
    expect(repos.map((r) => r.label)).toEqual(['Live']);
  });

  it('counts everything past the cap instead of listing it', () => {
    const projects = Array.from({ length: 14 }, (_, i) => ({
      name: `P${i}`,
      path: `C:/repos/p${i}`,
    }));
    const { repos, omitted } = selectProjectRepos(projects, null, allExist, 10);
    expect(repos).toHaveLength(10);
    expect(omitted).toBe(4);
  });

  it('ignores projects with an empty path', () => {
    const { repos } = selectProjectRepos([{ name: 'Broken', path: '' }], null, allExist);
    expect(repos).toEqual([]);
  });
});

describe('shouldSend', () => {
  const cooldown = 5 * 60 * 1000;

  it('sends when no previous report is recorded', () => {
    expect(shouldSend(null, 1_000_000, cooldown)).toBe(true);
  });

  it('suppresses a restart inside the cooldown window', () => {
    expect(shouldSend(1_000_000, 1_000_000 + 60_000, cooldown)).toBe(false);
  });

  it('sends once the cooldown has elapsed', () => {
    expect(shouldSend(1_000_000, 1_000_000 + cooldown, cooldown)).toBe(true);
  });

  it('sends when the marker is in the future (clock jumped back)', () => {
    expect(shouldSend(2_000_000, 1_000_000, cooldown)).toBe(true);
  });

  it('always sends with the cooldown disabled', () => {
    expect(shouldSend(1_000_000, 1_000_000, 0)).toBe(true);
  });
});

describe('findRepoRoot', () => {
  it('walks up to the directory holding .git', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bp-startup-'));
    try {
      mkdirSync(join(tmp, '.git'));
      const nested = join(tmp, 'apps', 'server', 'src', 'runner');
      mkdirSync(nested, { recursive: true });
      expect(findRepoRoot(nested)).toBe(tmp);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns null when no checkout is above the start directory', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bp-startup-'));
    try {
      const nested = join(tmp, 'a', 'b');
      mkdirSync(nested, { recursive: true });
      // maxLevels 2 keeps the walk inside the temp dir, so a real .git
      // further up the filesystem can't make this flaky.
      expect(findRepoRoot(nested, 2)).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

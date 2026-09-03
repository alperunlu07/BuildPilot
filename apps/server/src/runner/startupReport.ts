import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, release, platform, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import simpleGit from 'simple-git';
import type { TelegramConfig } from '@buildpilot/shared-types';
import { logger } from '../logger';
import { CONFIG_DIR } from '../paths';
import { listCommits } from '../git/operations';
import { listProjects } from '../store/projects';

// "BuildPilot just started" -> Telegram. Fires once per server boot, right
// after the port is bound, and reports the machine, the local clock, the
// bound URL and where every checkout stands: the BuildPilot repo itself
// first, then each registered project (branch, drift against the upstream,
// uncommitted files, last few commits).
//
// The point is an at-a-glance answer to "which box is this, and what code is
// it running?" when the same bot serves several machines. Everything here is
// best-effort: a missing git checkout, a slow `git status` or a Telegram
// outage degrades the message or drops it, never the server boot.

// Skip the git section rather than hang the boot report on a pathological
// repo (huge worktree, network-mounted checkout, index.lock contention).
const GIT_TIMEOUT_MS = 8_000;
const SEND_TIMEOUT_MS = 10_000;

// `tsx watch` restarts the process on every file save, and a crash loop
// restarts it even faster. Without a cooldown either one turns the chat into
// a flood. A restart that matters (reboot, manual start) is virtually never
// within a few minutes of the previous one.
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

const MARKER_FILE = join(CONFIG_DIR, 'startup-report.json');

// Telegram rejects messages over 4096 chars. We stay well under it and cut
// long commit subjects individually so the tail of the report survives.
const MAX_MESSAGE_CHARS = 3_800;
const MAX_SUBJECT_CHARS = 72;
// The BuildPilot checkout is the one you're most likely reading the report
// for, so it gets a deeper log than the projects listed after it.
const SELF_COMMIT_COUNT = 5;
const PROJECT_COMMIT_COUNT = 3;
// Every extra repo costs a `git status` + `git log` at boot and a chunk of a
// 4096-char message. Past a dozen the report stops being glanceable anyway.
const MAX_PROJECT_REPOS = 10;
// Room kept free for the "… and N more repos not shown" trailer, so adding it
// can never push the message past the budget.
const FOOTER_BUDGET_CHARS = 60;

export interface StartupCommit {
  shortSha: string;
  subject: string;
  author: string;
  date: number; // unix ms, 0 when unknown
}

export interface RepoSummary {
  // Project name as registered in BuildPilot, or the directory name for the
  // BuildPilot checkout itself.
  label: string;
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: number;
  commits: StartupCommit[];
}

export interface StartupReportData {
  host: string;
  user: string;
  os: string;
  at: Date;
  serverUrl: string;
  version: string;
  // BuildPilot's own checkout first (when it has one), then one entry per
  // registered project whose path is a git repository.
  repos: RepoSummary[];
  // Repos left out because of MAX_PROJECT_REPOS — reported as a count so the
  // message never pretends the list is complete.
  omittedRepos: number;
}

// -- Formatting ------------------------------------------------------------

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

// Local wall-clock time, explicitly offset-tagged. Deliberately not
// Intl/locale-driven: the format has to be identical on every machine that
// reports into the same chat, and a packaged Node without full ICU would
// otherwise silently fall back to a different rendering.
export function formatTimestamp(d: Date): string {
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  // getTimezoneOffset is minutes *behind* UTC, so the sign is inverted.
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return `${date} ${time} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

export function truncate(s: string, max: number): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function formatDrift(repo: RepoSummary): string {
  if (!repo.tracking) return 'no upstream';
  if (repo.ahead === 0 && repo.behind === 0) return 'in sync';
  const parts: string[] = [];
  if (repo.ahead > 0) parts.push(`↑${repo.ahead}`);
  if (repo.behind > 0) parts.push(`↓${repo.behind}`);
  return parts.join(' ');
}

// Plain text, no parse_mode: commit subjects routinely contain _, *, backticks
// and brackets, all of which would either break Markdown parsing or need
// escaping at every call site.
export function formatStartupReport(d: StartupReportData): string {
  const header = [
    '\u{1F680} BuildPilot started',
    '',
    `PC:     ${d.host} (${d.user})`,
    `OS:     ${d.os}`,
    `Time:   ${formatTimestamp(d.at)}`,
    `Server: ${d.serverUrl} · v${d.version}`,
  ].join('\n');

  if (d.repos.length === 0) {
    return `${header}\n\nRepos:  none found (packaged install with no projects?)`;
  }

  // Sections are appended whole: a repo either gets its heading and all of
  // its commits, or it counts as omitted. A half-listed repo reads like the
  // repo simply has fewer commits, which is worse than saying nothing.
  let text = header;
  let omitted = d.omittedRepos;
  for (const repo of d.repos) {
    const section = `\n\n${formatRepoSection(repo)}`;
    if (text.length + section.length > MAX_MESSAGE_CHARS - FOOTER_BUDGET_CHARS) {
      omitted++;
      continue;
    }
    text += section;
  }
  if (omitted > 0) {
    text += `\n\n… and ${omitted} more repo${omitted === 1 ? '' : 's'} not shown`;
  }
  return text;
}

function formatRepoSection(repo: RepoSummary): string {
  const dirty =
    repo.dirtyFiles === 0
      ? 'clean'
      : `${repo.dirtyFiles} uncommitted file${repo.dirtyFiles === 1 ? '' : 's'}`;
  const lines = [`${repo.label} @ ${repo.branch} · ${formatDrift(repo)} · ${dirty}`];
  if (repo.commits.length === 0) {
    lines.push('  (no commits)');
    return lines.join('\n');
  }
  for (const c of repo.commits) {
    const when = c.date > 0 ? new Date(c.date) : null;
    const stamp = when ? ` · ${pad(when.getDate())}.${pad(when.getMonth() + 1)}` : '';
    lines.push(`  • ${c.shortSha} ${truncate(c.subject, MAX_SUBJECT_CHARS)} — ${c.author}${stamp}`);
  }
  return lines.join('\n');
}

// -- Collection ------------------------------------------------------------

// Walk up from `startDir` looking for the checkout root. `.git` is a file in
// worktrees and submodules, so existsSync (not a directory check) is correct.
export function findRepoRoot(startDir: string, maxLevels = 8): string | null {
  let dir = startDir;
  for (let i = 0; i < maxLevels; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveRepoRoot(): string | null {
  const override = process.env.BUILDPILOT_REPO_DIR;
  if (override) return existsSync(join(override, '.git')) ? override : null;
  // Prefer the module's own location over cwd: the desktop app spawns the
  // server with an arbitrary working directory, and `pnpm dev` runs it from
  // the monorepo root. import.meta.url is empty in the CommonJS-bundled
  // desktop build, where the bundle sits outside any checkout — fall through
  // to cwd there, which at least catches a hand-rolled BUILDPILOT_SERVER_CMD
  // launched from inside the repo.
  if (import.meta.url) {
    const fromModule = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    if (fromModule) return fromModule;
  }
  return findRepoRoot(process.cwd());
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function collectRepoSummary(
  root: string,
  label: string,
  commitCount: number,
): Promise<RepoSummary | null> {
  try {
    const status = await withTimeout(simpleGit(root).status(), GIT_TIMEOUT_MS, 'git status');
    const commits = await withTimeout(
      listCommits(root, 'HEAD', commitCount),
      GIT_TIMEOUT_MS,
      'git log',
    );
    return {
      label,
      branch: status.current ?? '(detached)',
      tracking: status.tracking ?? null,
      ahead: status.ahead ?? 0,
      behind: status.behind ?? 0,
      dirtyFiles: status.files.length,
      commits: commits.map((c) => ({
        shortSha: c.shortSha,
        subject: c.subject,
        author: c.author,
        date: c.date,
      })),
    };
  } catch (err) {
    logger.debug({ err: String(err), root }, 'startup report: git summary unavailable');
    return null;
  }
}

export interface ProjectRepo {
  label: string;
  path: string;
}

/**
 * Which registered projects get their own section, in report order.
 *
 * Two projects can legitimately point at the same working copy (different
 * pipelines over one checkout), and a project can point at the BuildPilot
 * repo itself — both would print the same commits twice, so paths are
 * de-duplicated. Windows paths compare case-insensitively; a stale project
 * whose directory is gone (external drive, deleted clone) is dropped rather
 * than reported as an error.
 *
 * `exists` is injected so this stays testable without touching the disk.
 */
export function selectProjectRepos(
  projects: Array<{ name: string; path: string }>,
  selfRoot: string | null,
  exists: (p: string) => boolean,
  max = MAX_PROJECT_REPOS,
): { repos: ProjectRepo[]; omitted: number } {
  const key = (p: string): string => resolve(p).toLowerCase();
  const seen = new Set<string>(selfRoot ? [key(selfRoot)] : []);
  const repos: ProjectRepo[] = [];
  let omitted = 0;

  for (const p of projects) {
    if (!p.path) continue;
    const k = key(p.path);
    if (seen.has(k)) continue;
    if (!exists(join(p.path, '.git'))) continue;
    seen.add(k);
    if (repos.length >= max) {
      omitted++;
      continue;
    }
    repos.push({ label: p.name, path: p.path });
  }
  return { repos, omitted };
}

function listProjectsSafely(): Array<{ name: string; path: string }> {
  try {
    return listProjects();
  } catch (err) {
    // The report also runs from one-off scripts where the DB was never
    // opened. Losing the project sections is fine; losing the report isn't.
    logger.debug({ err: String(err) }, 'startup report: project list unavailable');
    return [];
  }
}

export async function collectStartupReport(opts: {
  serverUrl: string;
  version: string;
  now?: Date;
}): Promise<StartupReportData> {
  const selfRoot = resolveRepoRoot();
  const { repos: projectRepos, omitted } = selectProjectRepos(
    listProjectsSafely(),
    selfRoot,
    existsSync,
  );

  // One `git status` per repo, all at once: they're independent, and a slow
  // checkout shouldn't serialise the rest behind its 8s timeout.
  const summaries = await Promise.all([
    selfRoot ? collectRepoSummary(selfRoot, basename(selfRoot), SELF_COMMIT_COUNT) : null,
    ...projectRepos.map((r) => collectRepoSummary(r.path, r.label, PROJECT_COMMIT_COUNT)),
  ]);

  return {
    host: hostname(),
    user: safeUser(),
    os: `${platform()} ${release()}`,
    at: opts.now ?? new Date(),
    serverUrl: opts.serverUrl,
    version: opts.version,
    repos: summaries.filter((s): s is RepoSummary => s !== null),
    omittedRepos: omitted,
  };
}

function safeUser(): string {
  try {
    return userInfo().username;
  } catch {
    // userInfo throws when the uid has no passwd entry (some containers).
    return 'unknown';
  }
}

// -- Cooldown marker -------------------------------------------------------

export function shouldSend(lastSentAt: number | null, now: number, cooldownMs: number): boolean {
  if (lastSentAt === null) return true;
  // A clock that jumped backwards (or a hand-edited marker) must not wedge
  // the report off forever - treat a future timestamp as "no record".
  if (lastSentAt > now) return true;
  return now - lastSentAt >= cooldownMs;
}

function readLastSentAt(): number | null {
  try {
    const raw = JSON.parse(readFileSync(MARKER_FILE, 'utf-8')) as { lastSentAt?: unknown };
    return typeof raw.lastSentAt === 'number' ? raw.lastSentAt : null;
  } catch {
    return null;
  }
}

function writeLastSentAt(ts: number): void {
  try {
    writeFileSync(MARKER_FILE, JSON.stringify({ lastSentAt: ts }), 'utf-8');
  } catch (err) {
    logger.debug({ err: String(err) }, 'startup report: could not write cooldown marker');
  }
}

function cooldownMs(): number {
  const raw = process.env.BUILDPILOT_STARTUP_NOTIFY_COOLDOWN_MS;
  if (!raw) return DEFAULT_COOLDOWN_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_COOLDOWN_MS;
}

// -- Send ------------------------------------------------------------------

/**
 * Send the boot report. Enabled whenever Telegram is configured with a
 * default chat; set `telegram.startupNotify: false` to opt out. Never throws
 * and never rejects - the caller fires it and forgets it.
 */
export async function sendStartupReport(
  cfg: TelegramConfig | null | undefined,
  opts: { serverUrl: string; version: string },
): Promise<void> {
  try {
    if (!cfg?.enabled || !cfg.botToken) return;
    if (cfg.startupNotify === false) return;
    if (!cfg.defaultChatId) {
      logger.debug('startup report: telegram has no default chat id, skipping');
      return;
    }

    const now = Date.now();
    if (!shouldSend(readLastSentAt(), now, cooldownMs())) {
      logger.debug('startup report: within cooldown of the previous one, skipping');
      return;
    }
    // Stamp before sending: a Telegram failure must not leave the marker
    // stale enough for a restart loop to retry on every crash.
    writeLastSentAt(now);

    const data = await collectStartupReport(opts);
    const text = formatStartupReport(data);

    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.defaultChatId, text, disable_notification: true }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; description?: string }
      | null;
    if (!res.ok || !json?.ok) {
      logger.warn(
        { status: res.status, description: json?.description },
        'startup report: telegram rejected the message',
      );
      return;
    }
    logger.info('startup report sent to telegram');
  } catch (err) {
    logger.warn({ err: String(err) }, 'startup report failed');
  }
}
